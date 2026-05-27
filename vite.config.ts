import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载 .env 文件中的环境变量
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [
      vue(),
      Components({
        resolvers: [VantResolver()],
      }),
      electron({
        main: {
          // Shortcut of `build.lib.entry`.
          entry: 'electron/main.ts',
          vite: {
            build: {
              rollupOptions: {
                external: ['dotenv', 'koffi', 'better-sqlite3'],
              },
            },
            // 将所有 VITE_ 环境变量注入到主进程代码中（构建时替换）
            define: Object.fromEntries(
              Object.entries(env).map(([key, val]) => [`process.env.${key}`, JSON.stringify(val)])
            ),
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: path.join(path.dirname(fileURLToPath(import.meta.url)), 'electron/preload.ts'),
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: process.env.NODE_ENV === 'test'
          // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
          ? undefined
          : {},
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        __dirname: path.resolve(__dirname, '.'),
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or 'modern'
          additionalData: `@use "@/style/_constant.scss" as *;`,
        },
      },
    },
  }
})
