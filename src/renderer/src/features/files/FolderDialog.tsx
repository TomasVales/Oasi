import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { dialog, fade } from '@/lib/motion'
import { Button } from '@/components/ui/Button'

export const FOLDER_EMOJIS = ['📁', '📐', '🧠', '📚', '📝', '🧪', '🔬', '🧮', '📊', '💻', '📖', '🎯', '💡', '✏️', '🧩', '📅', '⭐', '🔥', '🗂️', '🧾']

/** Crear o editar una carpeta: emoji (de la grilla o el que escribas) + nombre. */
export function FolderDialog({
  title,
  initial,
  onSave,
  onClose
}: {
  title: string
  initial?: { name: string; emoji: string }
  onSave: (v: { name: string; emoji: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '📁')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const submit = () => name.trim() && onSave({ name: name.trim(), emoji: emoji.trim() || '📁' })

  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <motion.form
        variants={dialog}
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="w-[360px] space-y-4 rounded-[12px] border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <input
            aria-label="Emoji"
            value={emoji}
            onChange={(e) => setEmoji([...e.target.value].slice(-2).join(''))}
            className="h-10 w-12 rounded-card border border-line bg-canvas text-center text-xl focus:border-accent focus:outline-none"
          />
          <input
            ref={inputRef}
            aria-label="Nombre de la carpeta"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prácticos, Teoría, Parciales viejos…"
            className="h-10 flex-1 rounded-card border border-line bg-canvas px-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Emojis sugeridos">
          {FOLDER_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              onClick={() => setEmoji(e)}
              className={cn('flex h-8 items-center justify-center rounded-[7px] text-lg hover:bg-hover', emoji === e && 'bg-accent-soft ring-1 ring-accent')}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-fg-subtle">Podés escribir cualquier emoji en el primer campo (⌃⌘Espacio en macOS).</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Guardar
          </Button>
        </div>
      </motion.form>
    </motion.div>
  )
}
