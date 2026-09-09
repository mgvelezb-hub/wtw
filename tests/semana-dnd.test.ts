import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'

// El bug: soltar un bloque en la franja flex o en la cabecera del día pintaba
// el chip sin hora y, medio segundo después, el servidor lo regresaba al grid a
// su hora vieja. El arrastre decía una cosa y guardaba otra.
//
// Se mockean sesión y revalidación porque lo que se prueba es qué queda ESCRITO
// en la base, no el ciclo de request de Next.
const sesion = { userId: '' }
vi.mock('@/lib/auth', () => ({ verifySession: async () => (sesion.userId ? sesion : null) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const TEST_EMAIL = 'test-semana-dnd@vp.mx'
const MIERCOLES = '2026-08-12'
const JUEVES = '2026-08-13'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function bloqueALas(hhmm: string, fin: string) {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
  sesion.userId = user.id
  const week = await prisma.week.create({
    data: {
      userId: user.id,
      isoWeek: '2026-W33',
      rangoInicio: new Date('2026-08-10'),
      rangoFin: new Date('2026-08-16'),
      factorUsado: 1.4,
    },
  })
  const task = await prisma.task.create({ data: { userId: user.id, weekId: week.id, titulo: 'Modelo de red' } })
  const block = await prisma.block.create({
    data: {
      weekId: week.id,
      taskId: task.id,
      fecha: new Date(MIERCOLES),
      inicio: hhmm,
      fin,
      tipo: 'tarea',
      titulo: 'Modelo de red',
      planMin: 60,
    },
  })
  return { user, week, block }
}

describe('moverBloqueAction', () => {
  it('soltar sin hora le QUITA la hora al bloque', async () => {
    const { block } = await bloqueALas('10:00', '11:00')
    const { moverBloqueAction } = await import('@/app/(app)/semana/actions')

    await moverBloqueAction(block.id, MIERCOLES, null)

    const despues = await prisma.block.findUniqueOrThrow({ where: { id: block.id } })
    expect(despues.inicio).toBe('flex')
    expect(despues.fin).toBe('flex')
  })

  it('soltar sin hora en otro día mueve Y quita la hora', async () => {
    const { block } = await bloqueALas('10:00', '11:00')
    const { moverBloqueAction } = await import('@/app/(app)/semana/actions')

    await moverBloqueAction(block.id, JUEVES, null)

    const despues = await prisma.block.findUniqueOrThrow({ where: { id: block.id } })
    expect(despues.fecha.toISOString().slice(0, 10)).toBe(JUEVES)
    expect(despues.inicio).toBe('flex')
  })

  it('soltar a una altura del grid sigue escribiendo esa hora', async () => {
    const { block } = await bloqueALas('flex', 'flex')
    const { moverBloqueAction } = await import('@/app/(app)/semana/actions')

    await moverBloqueAction(block.id, MIERCOLES, '14:30')

    const despues = await prisma.block.findUniqueOrThrow({ where: { id: block.id } })
    expect(despues.inicio).toBe('14:30')
    expect(despues.fin).toBe('15:30')
  })

  it('una junta arrastrada a la franja flex conserva su hora — la manda el calendario', async () => {
    const { week } = await bloqueALas('10:00', '11:00')
    const junta = await prisma.block.create({
      data: {
        weekId: week.id,
        fecha: new Date(MIERCOLES),
        inicio: '16:00',
        fin: '17:00',
        tipo: 'junta',
        titulo: 'Comité',
        planMin: 60,
      },
    })
    const { moverBloqueAction } = await import('@/app/(app)/semana/actions')

    await moverBloqueAction(junta.id, JUEVES, null)

    const despues = await prisma.block.findUniqueOrThrow({ where: { id: junta.id } })
    expect(despues.inicio).toBe('16:00')
  })
})
