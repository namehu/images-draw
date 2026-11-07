import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, 'DRAW_DEV_')
  return {
    base: '/draw/', envDir: workspaceRoot, plugins: [vue()],
    server: { port: 5173, strictPort: true, proxy: { '/v1': { target: env.DRAW_DEV_UPSTREAM || 'https://sub.velunest.top', changeOrigin: true, timeout: 1_800_000, proxyTimeout: 1_800_000 } } },
    build: { target: 'es2022', sourcemap: false },
  }
})
