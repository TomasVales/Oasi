// El orden importa: './pdfjs' publica globalThis.pdfjsLib antes de evaluar pdf_viewer.mjs.
import './pdfjs'
import 'pdfjs-dist/web/pdf_viewer.css'
export { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
