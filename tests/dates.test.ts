import { describe, it, expect } from 'vitest'
import { isoWeekOf, weekRange } from '@/lib/dates'

describe('isoWeekOf', () => {
  it('calcula semana ISO con año correcto', () => {
    expect(isoWeekOf(new Date('2026-07-06'))).toBe('2026-W28')
    expect(isoWeekOf(new Date('2026-06-29'))).toBe('2026-W27')
    expect(isoWeekOf(new Date('2026-01-01'))).toBe('2026-W01')
    expect(isoWeekOf(new Date('2027-01-01'))).toBe('2026-W53') // año ISO ≠ año calendario
  })
})

describe('weekRange', () => {
  it('devuelve lunes y viernes de la semana ISO', () => {
    const { inicio, fin } = weekRange('2026-W27')
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-06-29')
    expect(fin.toISOString().slice(0, 10)).toBe('2026-07-03')
  })
  it('cruza años correctamente', () => {
    const { inicio } = weekRange('2026-W01')
    expect(inicio.toISOString().slice(0, 10)).toBe('2025-12-29')
  })
})
