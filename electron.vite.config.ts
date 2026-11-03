import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const shared = { '@shared': resolve('src/shared') }

// Recursos que pdf.js descarga en tiempo de ejecución (deben viajar con la app: funciona offline).
const pdfjsAssets = ['cmaps', 'standard_fonts', 'wasm', 'iccs'].map((dir) => ({
  // Ruta absoluta: la raíz del renderer es src/renderer, no la del proyecto.
  src: `${resolve('node_modules/pdfjs-dist', dir).replace(/\\/g, '/')}/*`,
  dest: `pdfjs/${dir}`,
  rename: { stripBase: true as const }
}))

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: {
        ...shared,
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), viteStaticCopy({ targets: pdfjsAssets })]
  }
})
