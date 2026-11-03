import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { motion } from 'framer-motion'
import { dialog, fade } from '@/lib/motion'
import { Button } from '@/components/ui/Button'

export interface MathEditRequest {
  mode: 'inline' | 'block'
  latex: string
  /** Posición del nodo existente; undefined = insertar uno nuevo. */
  pos?: number
}

/** Editor de LaTeX con vista previa en vivo (Electron no implementa window.prompt). */
export function MathDialog({
  request,
  onSave,
  onDelete,
  onClose
}: {
  request: MathEditRequest
  onSave: (latex: string) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [latex, setLatex] = useState(request.latex)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const preview = useMemo(
    () => katex.renderToString(latex || '\\square', { throwOnError: false, displayMode: request.mode === 'block' }),
    [latex, request.mode]
  )

  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-0 z-30 flex items-start justify-center bg-canvas/60 pt-24 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <motion.div
        variants={dialog}
        className="w-[min(520px,90%)] space-y-3 rounded-card border border-line bg-surface p-4 shadow-xl arcade:shadow-glow"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-fg-muted">
          {request.mode === 'block' ? 'Fórmula en bloque' : 'Fórmula en línea'} · LaTeX
        </p>
        <textarea
          ref={ref}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(latex)
            if (e.key === 'Escape') onClose()
          }}
          rows={3}
          spellCheck={false}
          placeholder="\int_0^\infty e^{-st} f(t)\,dt"
          className="w-full resize-none rounded-card border border-line bg-canvas p-2 font-mono text-sm focus:border-accent focus:outline-none"
        />
        <div
          className="flex min-h-14 items-center justify-center overflow-x-auto rounded-card bg-surface-2 px-3 py-2 text-fg"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Eliminar
            </Button>
          )}
          <span className="flex-1 text-[11px] text-fg-subtle">⌘↵ para guardar</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={() => onSave(latex)} disabled={!latex.trim()}>
            Guardar
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
