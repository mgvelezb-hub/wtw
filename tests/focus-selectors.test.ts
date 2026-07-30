import { describe, it, expect } from 'vitest'
import {
  getActiveBlock,
  getNextTaskBlock,
  getUpcomingMeeting,
  getBreakSuggestion,
  pickRememberedActivity,
  type FocusBlock,
} from '@/lib/focus-selectors'

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

describe('getBreakSuggestion', () => {
  it('sugiere descanso corto y umbral bajo para tareas de 60min o menos', () => {
    expect(getBreakSuggestion(60)).toEqual({
      umbralMin: 30,
      breakMin: 5,
      actividad: 'Ponte de pie, estira, o mira por la ventana.',
    })
  })

  it('sugiere descanso largo y umbral alto para tareas de más de 60min', () => {
    expect(getBreakSuggestion(90)).toEqual({
      umbralMin: 50,
      breakMin: 10,
      actividad: 'Camina, estira, o toca guitarra unos minutos.',
    })
  })
})

describe('pickRememberedActivity', () => {
  it('sin focusTaskId ni actividad corriendo, no confunde una junta (taskId null) con la actividad', () => {
    const blocks = [block({ id: 'j', tipo: 'junta', externa: true, taskId: null })]
    expect(pickRememberedActivity(blocks, null, null)).toBeNull()
  })

  it('sin focusTaskId pero con algo corriendo, usa lo que corre', () => {
    const blocks = [block({ id: 'a', runningSince: '2026-07-30T15:00:00.000Z' })]
    expect(pickRememberedActivity(blocks, null, blocks[0])?.id).toBe('a')
  })

  it('con focusTaskId de una tarea no terminada, la muestra aunque nada esté corriendo (pausada)', () => {
    const blocks = [block({ id: 'a', taskId: 'task-1', done: false })]
    expect(pickRememberedActivity(blocks, 'task-1', null)?.id).toBe('a')
  })

  it('con focusTaskId de una tarea ya terminada, cae a lo que esté corriendo (o null)', () => {
    const blocks = [block({ id: 'a', taskId: 'task-1', done: true })]
    expect(pickRememberedActivity(blocks, 'task-1', null)).toBeNull()
  })
})
