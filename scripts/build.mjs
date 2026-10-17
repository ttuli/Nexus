// npm run build 的入口：准备打包用的环境变量、更新方式和更新说明，再依次执行 vue-tsc → vite build → electron-builder。
//
// electron-builder.json5 的 publish.url 写成 ${env.PUBLISH_URL}，由 electron-builder 打包时自行展开。
// 这里不改写配置文件：改文件会让每次打包后工作区都变脏，JSON5 重新序列化还会丢掉注释，
// 打包中途失败更会留下改了一半的文件。
//
// PUBLISH_URL 取值：已存在的环境变量优先（CI 可直接注入），否则读 .env。
// 只注入这一个变量，.env 里的其余配置仍由 Vite 自己读取，行为与原来一致。
//
// 用法: node scripts/build.mjs [--update-mode=prompt|silent] [electron-builder 参数...]
//       除 --update-mode 外的参数原样传给 electron-builder，例如 npm run build -- --update-mode=silent --dir
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const envFile = path.join(root, '.env')
const fileEnv = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)) : {}

// 自动更新源地址会写进安装包（resources/app-update.yml），发出去就改不了，必须显式配置
const publishUrl = process.env.PUBLISH_URL ?? fileEnv.PUBLISH_URL ?? ''
if (!/^https?:\/\/\S+$/.test(publishUrl)) {
  console.error(`[build] PUBLISH_URL ${publishUrl ? `无效: ${publishUrl}` : '未配置'}`)
  console.error('[build] 请在 .env 中配置自动更新源地址，例如 PUBLISH_URL=https://www.imflow.cloud:30443/auth/update')
  process.exit(1)
}
process.env.PUBLISH_URL = publishUrl
console.log(`[build] 自动更新源: ${publishUrl}`)

// 服务器地址、WS 协议版本在构建时写进客户端，缺了会静默退回 localhost 默认值。
// 这样的包一旦发到更新源，自动更新过去的客户端全都连不上服务器，所以打包前就拦下
const requiredEnv = [
  'VITE_AUTH_SERVER', 'VITE_USER_SERVER', 'VITE_GROUP_SERVER', 'VITE_MESSAGE_SERVER',
  'VITE_FILE_SERVER', 'VITE_WS_SERVER', 'VITE_WS_VERSION',
]
const missing = requiredEnv.filter((key) => !(process.env[key] ?? fileEnv[key]))
if (missing.length) {
  console.error(`[build] 缺少打包必需的配置: ${missing.join(', ')}，请在 .env 中补上`)
  process.exit(1)
}

// 更新方式：写进 latest.yml 的 vendor.updateMode，客户端据此决定怎么推送这个版本（见 electron/update/updateManager.ts）
//   prompt（默认）：登录成功后弹窗提示，用户同意才下载
//   silent：后台静默下载，下次退出时静默安装，再启动即是新版本
// 强制更新不在这里指定，由服务端决定：发布后把 etcd 的 config/app.min_version 改成新版本号。
// 发布后想改方式，直接改更新源上 latest.yml 的 vendor.updateMode 再重新上传即可。
// 指定方式：npm run build -- --update-mode=silent，或环境变量 UPDATE_MODE（CI 用），命令行优先。
// PowerShell 下 npm 是 npm.ps1，PowerShell 调 .ps1 会吃掉 `--`，npm 于是把 --update-mode 当成自己的配置项，
// 不传给本脚本，只设置环境变量 npm_config_update_mode，所以也要读它
const UPDATE_MODES = ['prompt', 'silent']
const builderArgs = []
let updateMode = process.env.npm_config_update_mode || process.env.UPDATE_MODE || 'prompt'
for (const arg of process.argv.slice(2)) {
  const matched = arg.match(/^--update-mode=(.*)$/)
  if (matched) {
    updateMode = matched[1]
  } else {
    builderArgs.push(arg)
  }
}
if (!UPDATE_MODES.includes(updateMode)) {
  console.error(`[build] 不支持的更新方式: ${updateMode}，可选 ${UPDATE_MODES.join(' / ')}`)
  if (updateMode === 'forced') {
    console.error('[build] 强制更新由服务端决定：发布后把 etcd 的 config/app.min_version 改成新版本号')
  }
  process.exit(1)
}
builderArgs.push(`-c.releaseInfo.vendor.updateMode=${updateMode}`)
console.log(`[build] 更新方式: ${updateMode}`)

// 更新说明：取 release-notes/<版本号>.md，由 electron-builder 写进 latest.yml 的 releaseNotes，
// 可选更新提示框和更新窗口都显示它。按纯文本原样展示：Markdown 语法不渲染，尖括号括起的内容会被当成 HTML 标签去掉。
// 按版本号分文件：忘了写只会显示默认文案「本次更新包含问题修复与体验优化。」，不会把上个版本的说明带进新版本
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const notesFile = `release-notes/${version}.md`
if (existsSync(path.join(root, notesFile))) {
  builderArgs.push(`-c.releaseInfo.releaseNotesFile=${notesFile}`)
  console.log(`[build] 更新说明: ${notesFile}`)
} else {
  console.warn(`[build] 未找到 ${notesFile}，更新提示将显示默认文案`)
}

// 用 node 直接运行各工具的入口文件：不经 shell，参数不用转义，也不依赖 npm 把 node_modules/.bin 加进 PATH
function binOf(pkg) {
  const dir = path.join(root, 'node_modules', pkg)
  const { bin } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  return path.join(dir, typeof bin === 'string' ? bin : bin[pkg])
}

function run(pkg, args = []) {
  const { status, error } = spawnSync(process.execPath, [binOf(pkg), ...args], { cwd: root, stdio: 'inherit' })
  if (error) throw error
  if (status !== 0) process.exit(status ?? 1)
}

run('vue-tsc')
run('vite', ['build'])
run('electron-builder', builderArgs)
