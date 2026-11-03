import { BrowserWindow, dialog, shell } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
export { buildMarkdownExport, resolveAnchorLinks, safeFileName } from './exportFormat'

/** Colores de impresión (tema claro, alto contraste). */
const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.6 -apple-system, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif; color: #1f1f1d; margin: 0; }
  header.doc { border-bottom: 1px solid #e5e5e3; padding-bottom: 8pt; margin-bottom: 14pt; }
  header.doc h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
  header.doc p { margin: 0; color: #6f6e69; font-size: 9.5pt; }
  h1, h2, h3 { line-height: 1.25; margin: 1.3em 0 0.4em; break-after: avoid; }
  h1 { font-size: 16pt; } h2 { font-size: 13.5pt; } h3 { font-size: 12pt; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 1.4em; }
  blockquote { margin: 0.8em 0; padding: 0.4em 1em; border-left: 3px solid #9065b0; background: #f6f2fa; border-radius: 0 6px 6px 0; }
  code { font: 9.5pt/1.5 'JetBrains Mono', ui-monospace, Menlo, monospace; background: #f1f1ef; padding: 0.1em 0.35em; border-radius: 4px; }
  pre { background: #f6f6f4; border: 1px solid #e5e5e3; border-radius: 6px; padding: 9pt 11pt; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  .ref { color: #2383e2; font-weight: 500; }
  [data-type='block-math'] { text-align: center; margin: 0.8em 0; break-inside: avoid; }
  hr { border: none; border-top: 1px solid #e5e5e3; }
  .hljs-keyword, .hljs-built_in, .hljs-type, .hljs-literal { color: #d73a49; }
  .hljs-string, .hljs-regexp { color: #032f62; }
  .hljs-number { color: #005cc5; }
  .hljs-comment { color: #6a737d; font-style: italic; }
  .hljs-title, .hljs-section { color: #6f42c1; }
  .hljs-attr, .hljs-variable, .hljs-params, .hljs-property { color: #e36209; }
`

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function buildPrintHtml(bodyHtml: string, title: string, meta: string): Promise<{ html: string; baseDir: string }> {
  const katexCss = require.resolve('katex/dist/katex.min.css')
  const css = await readFile(katexCss, 'utf8')
  // CSP: sin scripts ni red. Solo estilos en línea y fuentes locales (las de KaTeX).
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src file: data:; img-src data: file:">
<title>${escapeHtml(title)}</title><style>${css}</style><style>${PRINT_CSS}</style></head>
<body><header class="doc"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(meta)}</p></header>
<main>${bodyHtml}</main></body></html>`
  return { html, baseDir: dirname(katexCss) }
}

/** Imprime HTML a PDF en una ventana oculta, sin JavaScript. */
export async function htmlToPdf(html: string, baseDir: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'sos-print-'))
  // El HTML va junto a las fuentes de KaTeX (rutas relativas "fonts/…").
  const file = join(dir, 'note.html')
  await writeFile(file, html.replace('<head>', `<head><base href="${pathToFileURL(baseDir).href}/">`))
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } })
  try {
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font:8px -apple-system,Helvetica;color:#9b9a97;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.6, bottom: 0.7, left: 0.55, right: 0.55 }
    })
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

/** Rutas exportadas en esta sesión: solo esas se pueden revelar en el Finder desde la UI. */
const exported = new Set<string>()

export async function saveExport(
  parent: BrowserWindow | null,
  defaultName: string,
  kind: 'md' | 'pdf',
  data: string | Buffer
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: kind === 'pdf' ? 'Exportar apunte como PDF' : 'Exportar apunte como Markdown',
    defaultPath: `${defaultName}.${kind}`,
    filters: [kind === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Markdown', extensions: ['md'] }]
  }
  const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  await writeFile(filePath, data)
  exported.add(filePath)
  return filePath
}

export function revealExport(path: string): boolean {
  if (!exported.has(path)) return false
  shell.showItemInFolder(path)
  return true
}

export const exportFileLabel = (path: string) => basename(path)
