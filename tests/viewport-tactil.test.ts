import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// Dos reglas que no se ven en ninguna pantalla hasta que faltan, y que ya
// habían estado rotas meses sin que nadie lo notara: el padding de safe-area
// de la nav inferior llevaba escrito desde entonces y valía 0.

describe('viewport', () => {
  // Se lee el fuente en vez de importar el layout: `next/font/google` no
  // resuelve fuera del build de Next y tumbaría el archivo entero.
  it('declara viewport-fit=cover, o todo env(safe-area-inset-*) vale 0', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf-8')
    expect(layout).toMatch(/viewportFit:\s*["']cover["']/)
  })
})

describe('el suelo del documento', () => {
  it('html y body se pintan con paper, no con la superficie blanca', () => {
    // Con `viewport-fit=cover` la página llega al borde físico del iPad, y lo
    // que se ve bajo el indicador de inicio —y en el rebote del scroll— es el
    // fondo del DOCUMENTO, no el de la app. Con `surface` ahí aparecía una
    // franja blanca en el tema claro; en los oscuros habría sido peor.
    const css = readFileSync('src/app/globals.css', 'utf-8')
    expect(css).toMatch(/html \{\s*background: var\(--paper\);\s*\}/)
    expect(css).toMatch(/body \{\s*background: var\(--paper\);/)
  })
})

describe('áreas seguras', () => {
  it('el rail y el contenido reservan la barra de estado', () => {
    // El `env(safe-area-inset-*)` que se agregó con `viewport-fit=cover` solo
    // vivía en la nav inferior, que en iPad está OCULTA: el rail y el contenido
    // arrancaban en y=0 y la fecha del sistema quedaba encima del nombre.
    const shell = readFileSync('src/app/(app)/AppShell.tsx', 'utf-8')
    expect(shell).toContain('pt-[calc(1rem+env(safe-area-inset-top))]')
    expect(shell).toContain('pt-[env(safe-area-inset-top)]')
    expect(shell).toContain('pb-[env(safe-area-inset-bottom)]')
  })
})

describe('campos en táctil', () => {
  it('los controles de formulario llegan a 16 px en punteros gruesos', () => {
    const css = readFileSync('src/app/globals.css', 'utf-8')
    // Por debajo de 16 px iOS hace zoom al enfocar y no regresa. La regla vive
    // en una media query de puntero grueso para no engordar la escala en monitor.
    const bloque = css.match(/@media \(pointer: coarse\) \{[^}]*\{[^}]*\}\s*\}/)?.[0] ?? ''
    expect(bloque).toContain('font-size: 16px !important')
    for (const control of ['input', 'textarea', 'select']) expect(bloque).toContain(control)
  })
})
