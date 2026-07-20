import { describe, it, expect } from 'vitest'
import { getActiveBlock, getNextTaskBlock, getUpcomingMeeting, type FocusBlock } from '@/lib/focus-selectors'

function block(overrides: Partial<FocusBlock>): FocusBlock {
  return {
    id: 'x',
    inicio: '09:00',
    fin: '10:00',
    tipo: 'tarea',
    titulo: 'Actividad',
    planMin: 60,
    taskId: 'task-1',
    done: false,
    externa: false,
    bloqueante: true,
    runningSince: null,
    ...overrides,
  }
}

describe('getActiveBlock', () => {
  it('devuelve el bloque con runningSince activo', () => {
    const blocks = [block({ id: 'a' }), block({ id: 'b', runningSince: '2026-07-20T15:00:00.000Z' })]
    expect(getActiveBlock(blocks)?.id).toBe('b')
  })

  it('devuelve null si ninguno está corriendo', () => {
    expect(getActiveBlock([block({ id: 'a' })])).toBeNull()
  })
})

describe('getNextTaskBlock', () => {
  it('devuelve la siguiente tarea cronometrable después de la hora dada', () => {
    const blocks = [
      block({ id: 'a', inicio: '09:00', done: true }),
      block({ id: 'b', inicio: '14:00' }),
      block({ id: 'c', inicio: '11:00' }),
    ]
    expect(getNextTaskBlock(blocks, '10:30')?.id).toBe('c')
  })

  it('ignora juntas externas y bloques sin taskId', () => {
    const blocks = [
      block({ id: 'a', inicio: '11:00', externa: true }),
      block({ id: 'b', inicio: '12:00', taskId: null }),
      block({ id: 'c', inicio: '13:00' }),
    ]
    expect(getNextTaskBlock(blocks, '10:00')?.id).toBe('c')
  })

  it('devuelve null si no queda ninguna tarea después', () => {
    expect(getNextTaskBlock([block({ id: 'a', inicio: '09:00' })], '10:00')).toBeNull()
  })
})

describe('getUpcomingMeeting', () => {
  it('devuelve la próxima junta bloqueante con minutos restantes', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: true })]
    const meeting = getUpcomingMeeting(blocks, '10:50', 5)
    expect(meeting?.block.id).toBe('j')
    expect(meeting?.minutesUntil).toBe(10)
    expect(meeting?.highlight).toBe(false)
  })

  it('resalta cuando faltan menos minutos que el umbral', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: true })]
    const meeting = getUpcomingMeeting(blocks, '10:57', 5)
    expect(meeting?.minutesUntil).toBe(3)
    expect(meeting?.highlight).toBe(true)
  })

  it('ignora juntas no bloqueantes (informativas)', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: false })]
    expect(getUpcomingMeeting(blocks, '10:50', 5)).toBeNull()
  })

  it('devuelve null si no hay juntas próximas', () => {
    expect(getUpcomingMeeting([block({ id: 'a', inicio: '09:00' })], '10:00', 5)).toBeNull()
  })
})
