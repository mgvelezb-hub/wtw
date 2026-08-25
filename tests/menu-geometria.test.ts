import { describe, it, expect } from 'vitest'
import { colocarMenu, ANCHO_MENU, MARGEN_MENU, SEPARACION_MENU } from '@/app/(app)/dia/menu-geometria'

// Viewport de referencia: iPad en horizontal, que es donde Mau usa la app.
const VP = { ancho: 1024, alto: 768 }
const ALTO_PANEL = 200

describe('colocarMenu', () => {
  it('abre hacia abajo cuando cabe — es lo que el dedo espera', () => {
    const boton = { top: 200, bottom: 240, right: 900 }
    const p = colocarMenu(boton, ALTO_PANEL, VP)

    expect(p.haciaArriba).toBe(false)
    expect(p.top).toBe(240 + SEPARACION_MENU)
  })

  // El bug reportado: el ⋯ del último bloque del día abría hacia abajo y el menú
  // se salía de la pantalla.
  it('se voltea hacia arriba cuando abajo no cabe y arriba sí', () => {
    const boton = { top: 700, bottom: 740, right: 900 } // casi al fondo de 768
    const p = colocarMenu(boton, ALTO_PANEL, VP)

    expect(p.haciaArriba).toBe(true)
    expect(p.top).toBe(700 - SEPARACION_MENU - ALTO_PANEL)
    // El menú completo queda dentro de la pantalla, que es lo que fallaba.
    expect(p.top).toBeGreaterThanOrEqual(MARGEN_MENU)
    expect(p.top + ALTO_PANEL).toBeLessThanOrEqual(VP.alto)
  })

  it('no se voltea si arriba hay todavía menos espacio que abajo', () => {
    // Botón pegado al techo: abajo no cabe el panel, pero arriba cabe menos.
    const boton = { top: 20, bottom: 60, right: 900 }
    const p = colocarMenu({ ...boton }, 900, { ancho: 1024, alto: 400 })

    expect(p.haciaArriba).toBe(false)
    expect(p.maxHeight).toBeGreaterThanOrEqual(120)
  })

  it('cuando no cabe en ningún lado, acota la altura en vez de recortarse', () => {
    const boton = { top: 300, bottom: 340, right: 900 }
    const p = colocarMenu(boton, 5000, { ancho: 1024, alto: 700 })

    expect(p.maxHeight).toBeLessThan(5000)
    expect(p.maxHeight).toBeGreaterThanOrEqual(120)
  })

  it('alinea el menú a la derecha del botón', () => {
    const boton = { top: 200, bottom: 240, right: 900 }
    const p = colocarMenu(boton, ALTO_PANEL, VP)

    expect(p.left).toBe(900 - ANCHO_MENU)
  })

  it('lo mete de vuelta a la pantalla cuando el botón está pegado al borde derecho', () => {
    const boton = { top: 200, bottom: 240, right: 1020 } // 4 px del borde
    const p = colocarMenu(boton, ALTO_PANEL, VP)

    expect(p.left + ANCHO_MENU).toBeLessThanOrEqual(VP.ancho - MARGEN_MENU)
  })

  it('nunca se sale por la izquierda en una pantalla angosta', () => {
    // iPhone: el menú es más ancho que el hueco disponible a la izquierda del botón.
    const boton = { top: 300, bottom: 340, right: 180 }
    const p = colocarMenu(boton, ALTO_PANEL, { ancho: 390, alto: 844 })

    expect(p.left).toBeGreaterThanOrEqual(MARGEN_MENU)
  })
})
