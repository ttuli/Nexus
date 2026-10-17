// 把本次打包产物上传到 OSS 更新源目录：CI 推标签发版时自动执行，也可以本地 npm run publish:oss 手动发。
//
// 上传 release/<package.json 的版本>/ 下的三个文件，顺序固定：安装包 → 安装包的 .blockmap → latest.yml。
// latest.yml 相当于开关，它一更新，所有客户端就会去下载它指向的安装包，所以必须等前两个传完再传，
// 并设置 Cache-Control: no-cache，免得 CDN、代理返回缓存的旧清单。
// 只增不删：旧版本的 .blockmap 是增量更新时对比用的"旧版"，删掉会让增量下载退回完整下载。
//
// 环境变量（CI 里来自仓库的 Variables / Secrets）：
//   OSS_REGION             地域，如 oss-cn-hangzhou
//   OSS_BUCKET             Bucket 名，需公共读
//   OSS_PREFIX             更新源目录，如 nexus/win；须与服务端 AppVersion.UpdateFeedURL 指向的目录一致
//   OSS_ACCESS_KEY_ID      建议用只有该目录上传权限的 RAM 子账号
//   OSS_ACCESS_KEY_SECRET
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OSS from 'ali-oss'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`[publish-oss] ${message}`)
  process.exit(1)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) fail(`缺少环境变量 ${name}`)
  return value
}

const region = requireEnv('OSS_REGION')
const bucket = requireEnv('OSS_BUCKET')
const prefix = requireEnv('OSS_PREFIX').replace(/^\/+|\/+$/g, '')
const accessKeyId = requireEnv('OSS_ACCESS_KEY_ID')
const accessKeySecret = requireEnv('OSS_ACCESS_KEY_SECRET')

// 产物目录与 electron-builder.json5 的 directories.output（release/${version}）一致
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const dir = path.join(root, 'release', version)
const latestFile = path.join(dir, 'latest.yml')
if (!existsSync(latestFile)) fail(`找不到 ${path.relative(root, latestFile)}，请先 npm run build`)

// 安装包文件名取自 latest.yml，并确认这份清单就是本次版本的；只读两个单行字段，用不着 YAML 解析器
const latest = readFileSync(latestFile, 'utf8')
const field = (name) => latest.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1].replace(/^['"]|['"]$/g, '')
if (field('version') !== version) fail(`latest.yml 的版本 ${field('version')} 与 package.json 的 ${version} 不一致`)
const installer = field('path')
if (!installer) fail('latest.yml 里没有安装包文件名（path 字段）')
// 更新方式在 vendor.updateMode 里（打包时 --update-mode 指定，见 scripts/build.mjs），发布前打出来确认一眼
const updateMode = latest.match(/^\s+updateMode:\s*['"]?(\w+)/m)?.[1] ?? 'prompt'
console.log(`[publish-oss] ${version} 的更新方式: ${updateMode}`)

const uploads = [
  { name: installer },
  { name: `${installer}.blockmap` },
  { name: 'latest.yml', headers: { 'Cache-Control': 'no-cache' } },
]
for (const { name } of uploads) {
  if (!existsSync(path.join(dir, name))) fail(`找不到 ${path.relative(root, path.join(dir, name))}`)
}

// GitHub 的 Runner 在境外，上传到国内地域较慢，单个请求的超时放宽到 5 分钟
const client = new OSS({ region, bucket, accessKeyId, accessKeySecret, secure: true, timeout: 5 * 60 * 1000 })

for (const { name, headers } of uploads) {
  const key = `${prefix}/${name}`
  const file = path.join(dir, name)
  const options = headers ? { headers } : {}
  console.log(`[publish-oss] 上传 ${name} → oss://${bucket}/${key}`)
  if (name.endsWith('.exe')) {
    // 安装包上百 MB，分片并发上传
    await client.multipartUpload(key, file, { ...options, parallel: 4, partSize: 8 * 1024 * 1024 })
  } else {
    await client.put(key, file, options)
  }
}

console.log(`[publish-oss] ${version} 已发布：https://${bucket}.${region}.aliyuncs.com/${prefix}/latest.yml`)
