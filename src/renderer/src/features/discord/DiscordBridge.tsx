import { useEffect, useRef } from 'react'
import { DEFAULT_DISCORD } from '@shared/discord'
import { api } from '@/lib/api'
import { useSettings } from '@/hooks/useAppData'
import { usePresence } from './usePresence'

/** Mantiene tu estado de Discord al día con lo que hacés en Oasi. */
export function DiscordBridge() {
  const { data: settings } = useSettings()
  const enabled = (settings?.discord ?? DEFAULT_DISCORD).enabled
  const presence = usePresence()
  const last = useRef('')

  useEffect(() => {
    const payload = enabled ? presence : null
    const key = JSON.stringify(payload)
    if (key === last.current) return
    last.current = key
    api.discord.update(payload)
  }, [presence, enabled])

  return null
}
