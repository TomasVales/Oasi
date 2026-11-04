import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { toast as toastMotion } from '@/lib/motion'

const UNDO_MS = 6000

interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
  action?: { label: string; run: () => void }
}

interface Pending {
  commit: () => void | Promise<void>
  timer: number
}

interface ToastContextValue {
  show: (t: Omit<Toast, 'id'>) => void
  /**
   * Acción que se puede deshacer: se ejecuta `commit` recién cuando el aviso desaparece.
   * Hasta entonces quien llama oculta el ítem; "Deshacer" llama a `undo` y no se borra nada.
   */
  undoable: (opts: { text: string; commit: () => void | Promise<void>; undo: () => void; onError?: (err: unknown) => void }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Avisos globales abajo al centro (uno a la vez). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const nextId = useRef(1)
  const pending = useRef(new Map<number, Pending>())

  const flush = useCallback((id: number) => {
    const p = pending.current.get(id)
    if (!p) return
    pending.current.delete(id)
    window.clearTimeout(p.timer)
    void p.commit()
  }, [])

  // Lo que quedó pendiente se aplica igual si la ventana se cierra o recarga.
  useEffect(() => {
    const flushAll = () => [...pending.current.keys()].forEach(flush)
    window.addEventListener('beforeunload', flushAll)
    return () => {
      window.removeEventListener('beforeunload', flushAll)
      flushAll()
    }
  }, [flush])

  const show = useCallback((t: Omit<Toast, 'id'>) => setCurrent({ ...t, id: nextId.current++ }), [])

  const undoable = useCallback<ToastContextValue['undoable']>(
    ({ text, commit, undo, onError }) => {
      const id = nextId.current++
      const safeCommit = async () => {
        try {
          await commit()
        } catch (err) {
          undo()
          onError?.(err)
        }
      }
      pending.current.set(id, {
        commit: safeCommit,
        timer: window.setTimeout(() => {
          flush(id)
          setCurrent((c) => (c?.id === id ? null : c))
        }, UNDO_MS)
      })
      setCurrent({
        id,
        kind: 'info',
        text,
        action: {
          label: 'Deshacer',
          run: () => {
            const p = pending.current.get(id)
            if (!p) return
            window.clearTimeout(p.timer)
            pending.current.delete(id)
            undo()
          }
        }
      })
    },
    [flush]
  )

  // Avisos simples: se van solos.
  useEffect(() => {
    if (!current || pending.current.has(current.id)) return
    const t = window.setTimeout(() => setCurrent((c) => (c?.id === current.id ? null : c)), current.kind === 'error' ? 7000 : 3500)
    return () => window.clearTimeout(t)
  }, [current])

  const dismiss = () => {
    if (current) flush(current.id)
    setCurrent(null)
  }

  return (
    <ToastContext.Provider value={{ show, undoable }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[200] flex justify-center px-4">
        <AnimatePresence>
          {current && (
            <motion.div
              key={current.id}
              variants={toastMotion}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="status"
              style={{ backgroundColor: 'var(--surface)' }}
              className={cn(
                'pointer-events-auto flex max-w-md items-center gap-3 rounded-card border px-3.5 py-2 text-xs shadow-lg',
                current.kind === 'error' ? 'border-danger/40 text-danger' : 'border-line text-fg'
              )}
            >
              <span className="flex-1">{current.text}</span>
              {current.action && (
                <button
                  type="button"
                  onClick={() => {
                    current.action!.run()
                    setCurrent(null)
                  }}
                  className="shrink-0 font-semibold text-accent hover:underline"
                >
                  {current.action.label}
                </button>
              )}
              <button type="button" onClick={dismiss} aria-label="Cerrar aviso" className="text-fg-subtle hover:text-fg">
                <X size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
