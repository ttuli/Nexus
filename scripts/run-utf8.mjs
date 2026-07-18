// 跨平台启动包装器：让 Windows 控制台以 UTF-8 渲染日志，避免中文乱码。
//
// Node / Electron 始终以 UTF-8 字节输出日志。在中文 Windows 上，控制台默认代码页
// 为 CP936(GBK)，会把这些 UTF-8 字节按 GBK 解码，于是中文变成乱码。
// vite-plugin-electron 以 inherit 方式派生 Electron 主进程，其 console 输出会直接
// 落到当前终端，因此这里在启动 Vite 之前先把控制台输出代码页切换到 65001(UTF-8)。
// 代码页是“整个控制台”的属性且会保持，所以 Vite 及其所有继承该控制台的子进程
// （包括 Electron 主进程）都会正确渲染中文。
//
// 用法: node scripts/run-utf8.mjs <command> [args...]
import { spawn, execSync } from 'node:child_process'

if (process.platform === 'win32') {
  try {
    // chcp 作用于当前进程所附着的控制台（终端本身），一次设置对同控制台的兄弟进程都生效
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {
    // 没有可用控制台（例如从 GUI 启动）时无需切换，忽略即可
  }
}

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('run-utf8: no command provided')
  process.exit(1)
}

// shell:true 让 Windows 能解析 node_modules/.bin 下的 .cmd 可执行文件
const child = spawn(command, args, { stdio: 'inherit', shell: true })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
child.on('error', (err) => {
  console.error('run-utf8: failed to start command:', err)
  process.exit(1)
})
