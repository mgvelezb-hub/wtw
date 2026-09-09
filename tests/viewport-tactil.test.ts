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
