import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { flashcardsKey } from './ReviewPage'

/** Widget de Inicio: cuántas tarjetas tocan hoy y acceso directo al repaso. */
export function ReviewWidget() {
  const { data } = useQuery({ queryKey: flashcardsKey(null), queryFn: () => api.flashcards.deck(null), staleTime: 0 })
  if (!data) return <p className="text-sm text-fg-subtle">…</p>
  if (!data.total)
    return (
      <p className="text-sm text-fg-subtle">
        Escribí <code className="rounded bg-surface-2 px-1">pregunta :: respuesta</code> en tus apuntes y{' '}
        <Link to="/repaso" className="font-medium text-accent hover:underline">
          repasalas acá
        </Link>
        .
      </p>
    )
  const urgent = data.due.find((c) => c.examInDays !== null && c.examInDays <= 7)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-3xl leading-none font-bold tabular-nums">{data.due.length}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {data.due.length === 1 ? 'tarjeta para hoy' : 'tarjetas para hoy'}
          {data.newCount ? ` · ${data.newCount} nuevas` : ''}
        </p>
      </div>
      {urgent && (
        <p className="text-xs text-danger">
          {urgent.subjectName}: parcial {urgent.examInDays === 0 ? 'hoy' : `en ${urgent.examInDays} días`}
        </p>
      )}
      <Link
        to="/repaso"
        className="inline-flex h-8 items-center rounded-card bg-accent px-3 text-xs font-medium text-accent-fg hover:brightness-110"
      >
        {data.due.length ? 'Repasar ahora' : 'Ver repaso'}
      </Link>
    </div>
  )
}
