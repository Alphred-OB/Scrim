// Builds the live editor demo for the website: npm run build:web -> server/feedback/public/app
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// offline captions need the desktop app (it reads the sound with ffmpeg), so the 20 MB speech engine stays out
const noSpeechEngine: Plugin = {
  name: 'no-speech-engine',
  enforce: 'pre',
  load(id) {
    if (id.includes('whisper.worker.ts')) return "self.onmessage = () => self.postMessage({ type: 'error', message: 'Captions need the desktop app.' })"
  }
}

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  plugins: [react(), noSpeechEngine],
  assetsInclude: ['**/*.tflite'],
  worker: { format: 'es', plugins: () => [noSpeechEngine] },
  optimizeDeps: { exclude: ['@huggingface/transformers', 'onnxruntime-web'] },
  build: {
    target: 'es2022',
    outDir: resolve('server/feedback/public/app'),
    emptyOutDir: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: resolve('src/renderer/web.html') }
  }
})
