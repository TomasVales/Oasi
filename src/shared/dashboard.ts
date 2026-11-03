import { DASHBOARD_WIDGETS, type DashboardSettings, type DashboardWidget } from './settings'

/**
 * Normaliza un layout guardado: quita duplicados o ids desconocidos y agrega al final
 * los widgets nuevos (si una versión futura suma widgets, aparecen sin romper el orden).
 */
export function normalizeDashboard(d: Partial<DashboardSettings> | undefined): DashboardSettings {
  const known = new Set<string>(DASHBOARD_WIDGETS)
  const order: DashboardWidget[] = []
  for (const id of d?.order ?? []) if (known.has(id) && !order.includes(id)) order.push(id)
  for (const id of DASHBOARD_WIDGETS) if (!order.includes(id)) order.push(id)
  const hidden = [...new Set((d?.hidden ?? []).filter((id) => known.has(id)))]
  return { order, hidden }
}

/** Mueve `active` a la posición de `over` (semántica de arrayMove). */
export function moveWidget(order: DashboardWidget[], active: DashboardWidget, over: DashboardWidget): DashboardWidget[] {
  const from = order.indexOf(active)
  const to = order.indexOf(over)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  return next
}
