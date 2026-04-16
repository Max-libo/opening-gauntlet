import { defineConfig } from 'vite'

export default defineConfig({
  // Имя репозитория на GitHub — поменяй если назовёшь по-другому
  base: '/opening-gauntlet/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['stockfish'],
  },
})
