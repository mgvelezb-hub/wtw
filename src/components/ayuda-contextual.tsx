'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Ayuda por pieza de UI, no por pantalla: un "?" discreto junto al título de una
// card que abre una explicación de 2-4 líneas de QUÉ es, PARA QUÉ sirve y QUÉ
// hacer primero.
//
// No es `title=""` nativo: el tooltip del navegador no existe en táctil (el iPad
// es el dispositivo principal de esta app), no es accesible por teclado y no
// admite formato. Tampoco es un modal: la ayuda que tapa la pantalla obliga a
// memorizar antes de cerrar, y lo que se explica está justo detrás.
//
// Cierra con clic fuera, Escape o el mismo botón. El popover es `absolute` sobre
// un wrapper `relative`, así que no empuja el layout de la card al abrirse.
export function AyudaContextual({
  titulo,
  children,
  ejemplo,
  alineacion = 'izquierda',
  className,
}: {
  titulo: string
  children: ReactNode
  ejemplo?: string
  alineacion?: 'izquierda' | 'derecha'
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const wrapper = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!abierto) return

    function alClicFuera(e: MouseEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }

    // `mousedown` y no `click`: con `click` el mismo evento que abre el popover
    // burbujea hasta el documento y lo cierra en el acto.
    document.addEventListener('mousedown', alClicFuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alClicFuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  return (
    <span ref={wrapper} className={`relative inline-flex align-middle ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={`Qué es: ${titulo}`}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold leading-none transition-colors ${
          abierto
            ? 'border-brand bg-brand-soft text-brand-deep'
            : 'border-neutral-300 text-neutral-400 hover:border-brand hover:text-brand'
        }`}
      >
        ?
      </button>

      {abierto && (
        <span
          role="dialog"
          aria-label={`Qué es: ${titulo}`}
          // `normal-case tracking-normal font-normal`: casi todos los "?" viven
          // dentro de un <h2> con `uppercase tracking-wide font-bold`, y esas tres
          // propiedades se heredan. Sin el reset la ayuda sale GRITADA Y EN
          // NEGRITAS, que es justo lo contrario de una explicación calmada.
          className={`absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2.5rem)] rounded-lg border border-brand-soft bg-white p-3 text-left font-normal normal-case tracking-normal shadow-lg ${
            alineacion === 'derecha' ? 'right-0' : 'left-0'
          }`}
        >
          <span className="block text-xs font-bold text-brand-deep">{titulo}</span>
          <span className="mt-1 block text-xs font-normal leading-relaxed text-neutral-600">{children}</span>
          {ejemplo && (
            <span className="mt-1.5 block text-xs font-normal italic leading-relaxed text-neutral-500">{ejemplo}</span>
          )}
        </span>
      )}
    </span>
  )
}
