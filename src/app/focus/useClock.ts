'use client'

import { useEffect, useState } from 'react'

export type Clock = { tickMs: number | null; nowHHMM: string | null }

// Mismo patrón que el tick de DiaBoard.tsx: arranca en null para no romper la
// hidratación, se llena en el primer efecto tras montar.
export function useClock(): Clock {
  const [tickMs, setTickMs] = useState<number | null>(null)

  useEffect(() => {
    setTickMs(Date.now())
    const id = setInterval(() => setTickMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (tickMs === null) return { tickMs: null, nowHHMM: null }
  const d = new Date(tickMs)
  const nowHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { tickMs, nowHHMM }
}
