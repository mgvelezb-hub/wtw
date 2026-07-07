import { describe, it, expect } from 'vitest'
import { pickCurrentBlock, type DayBlock } from '@/lib/day-logic'

function block(overrides: Partial<DayBlock>): DayBlock {
  return { id: 'x', inicio: '09:00', fin: '10:00', done: false, ...overrides }
}

describe('pickCurrentBlock', () => {
  it('devuelve kind=current cuando ahora cae dentro de un bloque activo', () => {
    const blocks = [block({ id: 'a', inicio: '09:00', fin: '10:00' })]
    expect(pickCurrentBlock(blocks, '09:30')).toEqual({ kind: 'current', block: blocks[0] })
  })

  it('ignora bloques ya terminados (done)', () => {
    const blocks = [block({ id: 'a', inicio: '09:00', fin: '10:00', done: true })]
    expect(pickCurrentBlock(blocks, '09:30')).toEqual({ kind: 'none', block: null })
  })

  it('devuelve kind=next con el bloque activo más próximo si ninguno está en curso', () => {
    const blocks = [
      block({ id: 'a', inicio: '09:00', fin: '10:00', done: true }),
      block({ id: 'b', inicio: '14:00', fin: '15:00' }),
      block({ id: 'c', inicio: '11:00', fin: '12:00' }),
    ]
    expect(pickCurrentBlock(blocks, '10:30')).toEqual({ kind: 'next', block: blocks[2] })
  })

  it('ignora bloques con inicio "flex" al buscar siguiente', () => {
    const blocks = [
      block({ id: 'a', inicio: 'flex', fin: 'flex' }),
      block({ id: 'b', inicio: '14:00', fin: '15:00' }),
    ]
    expect(pickCurrentBlock(blocks, '08:00')).toEqual({ kind: 'next', block: blocks[1] })
  })

  it('devuelve kind=none si no queda nada pendiente hoy', () => {
    const blocks = [block({ id: 'a', inicio: '09:00', fin: '10:00', done: true })]
    expect(pickCurrentBlock(blocks, '18:00')).toEqual({ kind: 'none', block: null })
  })
})
