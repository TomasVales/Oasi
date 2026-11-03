import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Primer cuadro de un GIF como imagen estática (para "reducir movimiento"). */
async function firstFrame(url: string): Promise<string> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return await new Promise((r) => c.toBlob((b) => r(b ? URL.createObjectURL(b) : url)))
}

/** URL (blob:) del fondo guardado. Se libera al cambiar o desmontar. */
export function useBackgroundUrl(fileName: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!fileName) {
      setUrl(null)
      return
    }
    let cancelled = false
    const created: string[] = []
    void api.background.read().then(async (bg) => {
      if (!bg || cancelled) return
      let u = URL.createObjectURL(new Blob([bg.bytes as Uint8Array<ArrayBuffer>], { type: bg.mime }))
      created.push(u)
      if (bg.mime === 'image/gif' && prefersReducedMotion()) {
        u = await firstFrame(u)
        created.push(u)
      }
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [fileName])
  return url
}
