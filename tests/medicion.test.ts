import { describe, it, expect } from 'vitest'
import { medicionUsable, PROPORCION_MINIMA_MEDIDA } from '@/lib/medicion'

// Un cronómetro que no se prendió no deja un hueco: deja un número chiquito.
// Esa es toda la idea de este umbral.

describe('medicionUsable', () => {
  it('rechaza el cero, que es el caso obvio', () => {
    expect(medicionUsable(0, 120)).toBe(false)
  })

  it('rechaza la medición testimonial, que es el caso que se colaba', () => {
    // 125 planeados con 1 medido no dice "fui rapidísimo", dice "no medí" — y
    // metido en el factor lo empuja hacia ABAJO, al revés del sesgo real.
    expect(medicionUsable(1, 125)).toBe(false)
    expect(medicionUsable(32, 240)).toBe(false)
  })

  it('acepta desde el umbral exacto', () => {
    expect(medicionUsable(30, 120)).toBe(true)
    expect(medicionUsable(120 * PROPORCION_MINIMA_MEDIDA - 0.01, 120)).toBe(false)
  })

  it('acepta medir de más: pasarse es medición, no falta de ella', () => {
    expect(medicionUsable(300, 120)).toBe(true)
  })

  it('sin plan contra el cual comparar no hay proporción', () => {
    expect(medicionUsable(60, 0)).toBe(false)
  })
})
