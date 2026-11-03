/** Asocia un evento externo (p. ej. "Teórica AM2 - Aula 5") con una materia por nombre o código. */
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function matchSubject<T extends { id: string; name: string; code: string | null }>(text: string, subjects: T[]): T | null {
  const hay = ` ${normalize(text)} `
  let best: { s: T; score: number } | null = null
  for (const s of subjects) {
    const candidates = [s.name, s.code].filter((x): x is string => !!x?.trim()).map(normalize)
    for (const c of candidates) {
      if (c.length < 2) continue
      // Palabra completa: "am2" no debe coincidir dentro de "am22".
      if (hay.includes(` ${c} `)) {
        const score = c.length
        if (!best || score > best.score) best = { s, score }
      }
    }
  }
  return best?.s ?? null
}
