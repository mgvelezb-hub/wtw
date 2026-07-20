'use client'

import type { FocusBlock } from '@/lib/focus-selectors'

export function FocusNextShadow({ next, nowHHMM }: { next: FocusBlock | null; nowHHMM: string | null }) {
  if (!next) {
    return <p className="text-center text-sm text-white/20">Sin más actividades planeadas hoy</p>
  }

  const atrasada = !!nowHHMM && nowHHMM > next.inicio

  return (
    <p className="text-center text-sm text-white/30">
      Sigue: <span className="text-white/50">{next.titulo}</span>{' '}
      {atrasada ? (
        <span className="text-[#c9a24b]/70">— debía empezar a las {next.inicio}</span>
      ) : (
        <>a las {next.inicio}</>
      )}
    </p>
  )
}
