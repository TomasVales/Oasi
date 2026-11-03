import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Campo con etiqueta. Para un control simple usa <label> (clic en el texto enfoca el control).
 * Con `group`, para listas de checkboxes o varios controles, usa role="group": un <label>
 * no puede contener otros labels ni varios controles (un clic en el título los activaría).
 */
export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  const id = useId()
  const content = (
    <>
      <span id={id} className="text-xs font-medium text-fg-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </>
  )
  return group ? (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      {content}
    </div>
  ) : (
    <label className="flex flex-col gap-1.5">{content}</label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 rounded-card border border-line bg-canvas px-3 text-sm text-fg placeholder:text-fg-subtle',
        'focus:border-accent focus:outline-none arcade:focus:shadow-glow',
        className
      )}
      {...props}
    />
  )
})
