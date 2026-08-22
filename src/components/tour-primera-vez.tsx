'use client'

import { useEffect, useState, type ReactNode } from 'react'

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
  const [visto, setVisto] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setVisto(window.localStorage.getItem(PREFIJO + ruta) === '1')
    } catch {
      // Safari en modo privado tira al leer localStorage. Sin flag legible se
      // asume "ya visto": mejor no enseñar el tour que enseñarlo en cada carga.
      setVisto(true)
    }
  }, [ruta])

  function descartar() {
    try {
      window.localStorage.setItem(PREFIJO + ruta, '1')
    } catch {
      // Si no se puede persistir, al menos se cierra en esta sesión.
    }
    setVisto(true)
  }

  if (visto === null) return null

  // Reabrir no borra el flag: si la persona recarga, vuelve a quedar descartado.
  if (visto) {
    return (
      <button
        type="button"
        onClick={() => setVisto(false)}
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
