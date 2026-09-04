'use client'

import { useState, type ReactNode } from 'react'
import { useLocalStorage, escribirLocal } from '@/lib/local-store'

const PREFIJO = 'wtw-tour-visto:'

// Explicación de la PÁGINA completa —qué es y en qué orden se usa— la primera
// vez que alguien entra a la ruta. Después desaparece y deja en su lugar un "?"
// del mismo tamaño que el de `AyudaContextual`, que la vuelve a abrir: la ayuda
// que se descarta para siempre obliga a leerla con miedo la primera vez.
//
// El flag vive en localStorage por ruta (`wtw-tour-visto:/dia`) y NO en la DB:
// es preferencia de este dispositivo, no del usuario, y no vale un roundtrip.
//
// `visto` arranca en `null` y se llena en `useEffect` (regla 1 del CLAUDE.md):
// leer localStorage en el render inicial rompe la hidratación, porque el
// servidor no lo tiene. Mientras es `null` no se renderiza nada — parpadear el
// banner y esconderlo se ve peor que aparecer 16 ms tarde.
export function TourPrimeraVez({
  ruta,
  titulo = '¿Primera vez aquí?',
  bullets,
  className,
}: {
  ruta: string
  titulo?: string
  bullets: ReactNode[]
  className?: string
}) {
  // El store devuelve `null` en el servidor y cuando la clave no existe. Ojo con
  // el default: mientras no se sabe, el tour NO se enseña — un flash de tour en
  // cada carga sería peor que no verlo. `useLocalStorage` ya absorbe el caso de
  // Safari en modo privado, que tira al leer.
  const flag = useLocalStorage(PREFIJO + ruta)
  // Reabrir es efímero a propósito: no borra el flag, así que una recarga deja
  // la guía descartada otra vez.
  const [reabierto, setReabierto] = useState(false)
  const visto = flag === null ? null : flag === '1' && !reabierto

  function descartar() {
    escribirLocal(PREFIJO + ruta, '1')
  }

  if (visto === null) return null

  if (visto) {
    return (
      <button
        type="button"
        onClick={() => setReabierto(true)}
        aria-label={`${titulo} — ver la guía de esta página`}
        title="Ver de nuevo la guía de esta página"
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-hair text-[11px] font-bold leading-none text-faint transition-colors hover:border-brand hover:text-brand ${
          className ?? ''
        }`}
      >
        ?
      </button>
    )
  }

  return (
    // `w-full basis-full` para que, colocado en la misma fila `flex-wrap` que el
    // título de la página, el banner abierto baje solo a su propio renglón y el
    // "?" descartado se quede junto al título. Sin `basis-full` el item se
    // encogería para caber en el hueco sobrante en vez de saltar de línea.
    <div className={`w-full basis-full rounded-lg border border-hair bg-brand-soft/40 p-4 ${className ?? ''}`}>
      <p className="text-sm font-bold text-brand-deep">{titulo}</p>
      <ul className="mt-2 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
            <span aria-hidden className="text-brand">
              ·
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={descartar}
        className="mt-3 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-strong"
      >
        Entendido
      </button>
    </div>
  )
}
