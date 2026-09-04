'use client'

import { useReloj } from '@/lib/reloj'

export type Clock = { tickMs: number | null; nowHHMM: string | null }

// El tick viene del store compartido de `@/lib/reloj`; aquí solo se le da la
// forma que /focus consume. Antes esto tenía su propio `setInterval` y su
// propio `useState`: dos relojes en la app, desfasados entre sí, y un setState
// dentro del cuerpo de un efecto.
export function useClock(): Clock {
  const tickMs = useReloj()
  if (tickMs === null) return { tickMs: null, nowHHMM: null }
  const d = new Date(tickMs)
  const nowHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { tickMs, nowHHMM }
}
