import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf_viewer.mjs lee la librería desde globalThis.pdfjsLib: debe asignarse ANTES de importarlo
// (ver viewerLib.ts, que importa este módulo primero).
;(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Recursos copiados por vite-plugin-static-copy a /pdfjs (ver electron.vite.config.ts). */
const asset = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href

export function openPdf(data: Uint8Array) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs')
  })
}

export type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'
