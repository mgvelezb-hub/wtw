'use client'

import { createPortal } from 'react-dom'
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from 'react'
import { colocarMenu, ANCHO_MENU, type PosicionMenu } from '@/lib/menu-geometria'

// El menú ⋯ flotante, compartido. Nació en /dia resolviendo un bug concreto —el
// panel era hijo `absolute` de la fila, así que lo recortaba el overflow del
// contenedor y abría SIEMPRE hacia abajo, cayéndose de la pantalla en el último
// bloque del día— y el lienzo de /semana tenía el mismo problema con el menú de
// las juntas de Outlook: `fixed` en la coordenada del clic, sin voltear cuando
// abajo no cabe y dentro del árbol del DndContext.
//
// Tres piezas que hay que tener juntas o el bug vuelve: portal a document.body
// (nada de overflow que recorte), `fixed` recalculado en scroll y resize (con
// `fixed`, si la página scrollea el botón se mueve y el menú no), y la
// geometría en `lib/menu-geometria` para decidir el volteo sin navegador.

export function MenuFlotante({
  children,
  disabled,
  className,
  ariaLabel,
}: {
  children: (cerrar: () => void) => ReactNode
  disabled: boolean
  /** Para lectores de pantalla: qué se abre. Distinto en cada lugar de uso. */
  ariaLabel?: string
  // Solo presentación: la franja de AHORA lo pide de 44×44 con borde; en las
  // filas de la timeline es un glifo suelto en la columna de acción.
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<PosicionMenu | null>(null)
  const boton = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  // Se recalcula en scroll y resize mientras está abierto: con `fixed`, si la
  // página scrollea el botón se mueve y el menú no.
  useLayoutEffect(() => {
    if (!abierto) return

    function colocar() {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      setPos(
        colocarMenu(
          { top: r.top, bottom: r.bottom, right: r.right },
          panel.current?.offsetHeight ?? 0,
          { ancho: window.innerWidth, alto: window.innerHeight }
        )
      )
    }

    colocar()
    window.addEventListener('scroll', colocar, true)
    window.addEventListener('resize', colocar)
    return () => {
      window.removeEventListener('scroll', colocar, true)
      window.removeEventListener('resize', colocar)
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    function alHacerClicAfuera(e: MouseEvent) {
      const t = e.target as Node
      // El panel ya no es descendiente del botón en el DOM: hay que preguntarle
      // a los dos por separado o el primer clic dentro del menú lo cierra.
      if (boton.current?.contains(t) || panel.current?.contains(t)) return
      setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClicAfuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alHacerClicAfuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  return (
    <div className="relative">
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={ariaLabel ?? 'Más acciones del bloque'}
        title="Más acciones"
        onClick={() => setAbierto((v) => !v)}
        // El dedo, no el mouse: 40×40 mínimo de área de toque sin agrandar el
        // glifo (el ⋯ se ve igual, solo deja de fallarse en iPad).
        className={
          className ??
          `inline-flex h-9 w-9 items-center justify-center rounded-md text-sm leading-none lg:h-10 lg:w-10 ${
            abierto ? 'bg-hair text-ink' : 'text-faint hover:bg-surface hover:text-ink'
          }`
        }
      >
        ⋯
      </button>
      {abierto &&
        createPortal(
          // Se monta antes de tener posición para poder MEDIRLO y decidir si
          // abre hacia arriba; hasta entonces va oculto, no desplazado, para que
          // no se vea saltar. `useLayoutEffect` cierra el ciclo antes del paint.
          <div
            ref={panel}
            role="menu"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxHeight,
              width: ANCHO_MENU,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-50 space-y-0.5 overflow-y-auto rounded-lg border border-edge bg-surface p-1 shadow-lg"
          >
            {children(() => setAbierto(false))}
          </div>,
          document.body
        )}
    </div>
  )
}
