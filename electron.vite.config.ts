import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    // windows run sandboxed, where a preload can't require() node_modules, so Sentry is bundled in
    plugins: [externalizeDepsPlugin({ exclude: ['@sentry/electron'] })],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react()],
    assetsInclude: ['**/*.tflite'],
    worker: { format: 'es' },
    // the speech engine loads its own wasm next to itself; pre-bundling would move it (and reload the page)
    optimizeDeps: { exclude: ['@huggingface/transformers', 'onnxruntime-web'] },
    build: { target: 'chrome130' }
  }
})
