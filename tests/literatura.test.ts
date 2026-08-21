import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { registrarPropuesta, actualizarPropuesta, listarPropuestas } from '@/app/(app)/desarrollo/literatura-service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-literatura@vp.mx'
const OTRO_EMAIL = 'test-literatura-otro@vp.mx'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email = TEST_EMAIL) {
  return prisma.user.create({ data: { email, nombre: 'Test', passwordHash: 'x' } })
}

describe('registrarPropuesta', () => {
  it('registra insight y fuente, con dondePropuse opcional', async () => {
    const user = await usuario()

    const p = await registrarPropuesta(user.id, {
      insight: 'Pre-mortem antes de arrancar un proyecto grande',
      fuente: 'Thinking in Bets, Annie Duke',
    })

    expect(p.insight).toBe('Pre-mortem antes de arrancar un proyecto grande')
    expect(p.fuente).toBe('Thinking in Bets, Annie Duke')
    expect(p.dondePropuse).toBeNull()
    expect(p.queParo).toBeNull()
    expect(p.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('acepta dondePropuse al registrar', async () => {
    const user = await usuario()

    const p = await registrarPropuesta(user.id, {
      insight: 'Buffer obligatorio en la planeación semanal',
      fuente: 'proyecto anterior de logística',
      dondePropuse: 'comité de Liverpool',
    })

    expect(p.dondePropuse).toBe('comité de Liverpool')
  })

  it('rechaza insight vacío', async () => {
    const user = await usuario()
    await expect(registrarPropuesta(user.id, { insight: '  ', fuente: 'algo' })).rejects.toThrow(
      'la propuesta necesita el insight',
    )
  })

  it('rechaza fuente vacía', async () => {
    const user = await usuario()
    await expect(registrarPropuesta(user.id, { insight: 'algo', fuente: '  ' })).rejects.toThrow(
      'la propuesta necesita la fuente',
    )
  })
})

describe('actualizarPropuesta', () => {
  it('completa dondePropuse y queParo por separado, sin pisar el otro campo', async () => {
    const user = await usuario()
    const p = await registrarPropuesta(user.id, { insight: 'idea', fuente: 'fuente' })

    await actualizarPropuesta(user.id, p.id, { dondePropuse: 'comité de Liverpool' })
    let lista = await listarPropuestas(user.id)
    expect(lista[0].dondePropuse).toBe('comité de Liverpool')
    expect(lista[0].queParo).toBeNull()

    await actualizarPropuesta(user.id, p.id, { queParo: 'se adoptó' })
    lista = await listarPropuestas(user.id)
    expect(lista[0].dondePropuse).toBe('comité de Liverpool')
    expect(lista[0].queParo).toBe('se adoptó')
  })

  it('falla si la propuesta no le pertenece al usuario', async () => {
    const user = await usuario()
    const otro = await usuario(OTRO_EMAIL)
    const p = await registrarPropuesta(otro.id, { insight: 'idea de otro', fuente: 'fuente de otro' })

    await expect(actualizarPropuesta(user.id, p.id, { queParo: 'se adoptó' })).rejects.toThrow('propuesta no encontrada')
  })

  it('falla si el id no existe', async () => {
    const user = await usuario()
    await expect(actualizarPropuesta(user.id, 'no-existe', { queParo: 'se adoptó' })).rejects.toThrow(
      'propuesta no encontrada',
    )
  })
})

describe('listarPropuestas', () => {
  it('lista desc por fecha y solo del usuario dueño', async () => {
    const user = await usuario()
    const otro = await usuario(OTRO_EMAIL)

    const vieja = await prisma.propuestaLiteratura.create({
      data: { userId: user.id, insight: 'vieja', fuente: 'f1', fecha: new Date('2026-01-01') },
    })
    const nueva = await prisma.propuestaLiteratura.create({
      data: { userId: user.id, insight: 'nueva', fuente: 'f2', fecha: new Date('2026-08-01') },
    })
    await registrarPropuesta(otro.id, { insight: 'de otro', fuente: 'f3' })

    const lista = await listarPropuestas(user.id)

    expect(lista.map((p) => p.id)).toEqual([nueva.id, vieja.id])
    expect(lista.every((p) => p.insight !== 'de otro')).toBe(true)
  })
})

describe('deleteTestUser', () => {
  it('no truena al borrar un usuario con propuestas vivas', async () => {
    const user = await usuario()
    await registrarPropuesta(user.id, { insight: 'idea', fuente: 'fuente' })

    await expect(deleteTestUser(TEST_EMAIL)).resolves.not.toThrow()

    const restante = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })
    expect(restante).toBeNull()
  })
})
