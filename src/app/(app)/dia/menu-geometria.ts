// Geometría pura del menú ⋯ de un bloque. Vive aparte de DiaBoard.tsx por la
// misma razón que semana/lienzo.ts: la decisión de "¿abre hacia arriba o hacia
// abajo? ¿se sale de la pantalla?" es aritmética, y la aritmética se prueba sin
// navegador. El componente solo mide el botón y el panel y pinta lo que esto
// devuelve.
//
// El bug que originó esto: el menú era un hijo `absolute top-full` de la fila,
// así que (a) lo recortaba el overflow del contenedor y (b) abría SIEMPRE hacia
// abajo, cayéndose de la pantalla en el último bloque del día.

export const ANCHO_MENU = 240 // w-60
export const MARGEN_MENU = 10
export const SEPARACION_MENU = 6

export interface Rect {
  top: number
  bottom: number
  right: number
}

export interface Viewport {
  ancho: number
  alto: number
}

export interface PosicionMenu {
  top: number
  left: number
  maxHeight: number
  haciaArriba: boolean
}

export function colocarMenu(boton: Rect, panelAlto: number, vp: Viewport): PosicionMenu {
  const ancho = Math.min(ANCHO_MENU, vp.ancho - MARGEN_MENU * 2)

  // Alineado a la derecha del botón —el menú cuelga hacia la izquierda— y luego
  // acotado a la pantalla: en móvil el botón vive pegado al borde derecho y sin
  // el acote la mitad del panel queda fuera.
  const left = Math.max(MARGEN_MENU, Math.min(boton.right - ancho, vp.ancho - ancho - MARGEN_MENU))

  const abajo = vp.alto - boton.bottom - SEPARACION_MENU - MARGEN_MENU
  const arriba = boton.top - SEPARACION_MENU - MARGEN_MENU

  // Hacia arriba SOLO si abajo no cabe y arriba da más espacio. El default sigue
  // siendo hacia abajo: es lo que el dedo espera, y voltear sin necesidad mueve
  // el menú bajo el pulgar.
  const haciaArriba = panelAlto > abajo && arriba > abajo

  const top = haciaArriba
    ? Math.max(MARGEN_MENU, boton.top - SEPARACION_MENU - panelAlto)
    : boton.bottom + SEPARACION_MENU

  // Piso de 120 px: si ni arriba ni abajo cabe (pantalla muy baja, teclado
  // abierto), el menú scrollea por dentro en vez de quedar en un hilo. Nunca se
  // recorta, porque el panel es `fixed` en un portal.
  const maxHeight = Math.max(haciaArriba ? arriba : abajo, 120)

  return { top, left, maxHeight, haciaArriba }
}
