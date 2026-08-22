'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Ayuda por pieza de UI, no por pantalla: un "?" discreto junto al título de una
// card que abre una explicación de 2-4 líneas de QUÉ es, PARA QUÉ sirve y QUÉ
// hacer primero.
//
// No es `title=""` nativo: el tooltip del navegador no existe en táctil (el iPad
// es el dispositivo principal de esta app), no es accesible por teclado y no
// admite formato. Tampoco es un modal: la ayuda que tapa la pantalla obliga a
// memorizar antes de cerrar, y lo que se explica está justo detrás.
//
// El popover vive en un PORTAL con `position: fixed`, no como hijo absoluto del
// botón. Razón: varias cards están dentro de contenedores con `overflow-y: auto`
// (la columna derecha de /dia en desktop, la lista de pendientes) y un popover
// absoluto que se sale del contenedor queda recortado — se veía cortado por la
// izquierda en la card de Wins. Con el portal, ningún `overflow` de ancestro
// puede cortarlo; la posición se calcula desde el botón y se acota al viewport.
//
// Cierra con clic fuera, Escape o el mismo botón.

const ANCHO = 288 // w-72
const MARGEN = 10

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
  // Lado preferido hacia el que se extiende el popover desde el botón. Es solo
  // preferencia: si no cabe, se acota al viewport de todos modos.
  alineacion?: 'izquierda' | 'derecha'
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const boton = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLSpanElement | null>(null)

  // Posición fija desde el botón, acotada al viewport. Se recalcula en scroll y
  // resize mientras está abierto: con `fixed`, si la página scrollea el botón se
  // mueve y el popover no — mejor seguirlo que dejarlo huérfano.
  useLayoutEffect(() => {
    if (!abierto) return

    function colocar() {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      const vw = window.innerWidth
      const ancho = Math.min(ANCHO, vw - MARGEN * 2)
      let left = alineacion === 'derecha' ? r.right - ancho : r.left
      left = Math.max(MARGEN, Math.min(left, vw - ancho - MARGEN))
      setPos({ top: r.bottom + 6, left })
    }

    colocar()
    window.addEventListener('scroll', colocar, true)
    window.addEventListener('resize', colocar)
    return () => {
      window.removeEventListener('scroll', colocar, true)
      window.removeEventListener('resize', colocar)
    }
  }, [abierto, alineacion])

  useEffect(() => {
    if (!abierto) return

    function alClicFuera(e: MouseEvent) {
      const t = e.target as Node
      if (boton.current?.contains(t) || panel.current?.contains(t)) return
      setAbierto(false)
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
    <span className={`inline-flex align-middle ${className ?? ''}`}>
      <button
        ref={boton}
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

      {abierto &&
        pos &&
        createPortal(
          <span
            ref={panel}
            role="dialog"
            aria-label={`Qué es: ${titulo}`}
            style={{ top: pos.top, left: pos.left, width: Math.min(ANCHO, window.innerWidth - MARGEN * 2) }}
            // `normal-case tracking-normal font-normal`: el portal ya no hereda
            // del <h2> uppercase, pero el reset se conserva por si algún día el
            // popover vuelve a montarse en línea.
            className="fixed z-50 rounded-lg border border-brand-soft bg-white p-3 text-left font-normal normal-case tracking-normal shadow-lg"
          >
            <span className="block text-xs font-bold text-brand-deep">{titulo}</span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-neutral-600">{children}</span>
            {ejemplo && (
              <span className="mt-1.5 block text-xs font-normal italic leading-relaxed text-neutral-500">{ejemplo}</span>
            )}
          </span>,
          document.body,
        )}
    </span>
  )
}
