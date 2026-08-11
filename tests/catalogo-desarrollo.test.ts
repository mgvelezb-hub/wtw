import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCatalogoDesarrollo } from '@/app/(app)/desarrollo/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-catalogo@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  const gerente = await prisma.level.findFirst({ where: { nombre: 'Gerente' } })
  return prisma.user.create({
    data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x', nivelObjetivoId: gerente?.id },
  })
}

describe('getCatalogoDesarrollo', () => {
  it('agrupa material por cada reactivo del nivel objetivo', async () => {
    const user = await usuario()
    const cat = await getCatalogoDesarrollo(user.id)

    expect(cat.porObjetivo.map((o) => o.orden)).toEqual([9, 10, 11, 12])
    // Cada reactivo de Gerente tiene material mapeado — si alguno queda vacío, la
    // curaduría dejó un hueco y hay que verlo.
    for (const o of cat.porObjetivo) {
      expect(o.recursos.length, `reactivo ${o.orden} sin material`).toBeGreaterThan(0)
    }
  })

  it('el reactivo 10 (asignar y retroalimentar equipos) trae la bitácora de delegación', async () => {
    const user = await usuario()
    const cat = await getCatalogoDesarrollo(user.id)

    const r10 = cat.porObjetivo.find((o) => o.orden === 10)
    expect(r10?.recursos.map((r) => r.titulo)).toContain('Bitácora de delegación')
  })

  it('separa las prácticas recurrentes del material que se consume una vez', async () => {
    const user = await usuario()
    const cat = await getCatalogoDesarrollo(user.id)

    expect(cat.practicas.length).toBeGreaterThan(0)
    expect(cat.practicas.every((r) => r.tipo === 'ejercicio')).toBe(true)
    expect(cat.practicas.every((r) => r.cadencia !== null && r.cadencia !== 'una vez')).toBe(true)
  })

  it('ordena los rubros con el más hueco primero', async () => {
    const user = await usuario()
    // Dar evidencia a todo un rubro lo manda al final de la lista.
    const rol = await prisma.competency.findMany({ where: { tipo: 'rol', grupo: 'Quien presenta' } })
    for (const c of rol) {
      await prisma.evidence.create({ data: { userId: user.id, competencyId: c.id, nota: 'ok' } })
    }

    const cat = await getCatalogoDesarrollo(user.id)
    const idx = cat.porRubro.findIndex((r) => r.rubro === 'Quien presenta')

    expect(cat.porRubro[idx].conEvidencia).toBe(cat.porRubro[idx].total)
    expect(idx).toBe(cat.porRubro.length - 1)
  })

  it('arranca todo en pendiente y refleja el progreso por usuario', async () => {
    const user = await usuario()
    const antes = await getCatalogoDesarrollo(user.id)
    expect(antes.resumen.pendientes).toBe(antes.resumen.total)
    expect(antes.resumen.practicados).toBe(0)

    const ejercicio = await prisma.learningResource.findFirstOrThrow({ where: { titulo: 'Bitácora de delegación' } })
    await prisma.learningProgress.create({
      data: { userId: user.id, resourceId: ejercicio.id, estado: 'en_curso', veces: 3 },
    })

    const despues = await getCatalogoDesarrollo(user.id)
    expect(despues.resumen.enCurso).toBe(1)
    expect(despues.resumen.practicados).toBe(3)
    expect(despues.practicas.find((r) => r.id === ejercicio.id)?.veces).toBe(3)
  })

  it('no filtra el progreso de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: 'test-catalogo-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const recurso = await prisma.learningResource.findFirstOrThrow({})
    await prisma.learningProgress.create({ data: { userId: otro.id, resourceId: recurso.id, estado: 'hecho' } })

    const cat = await getCatalogoDesarrollo(user.id)
    expect(cat.resumen.hechos).toBe(0)

    await prisma.learningProgress.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })

  it('todo recurso trae justificación — sin "por qué sirve" es lectura general', async () => {
    const recursos = await prisma.learningResource.findMany({ include: { competencias: { select: { id: true } } } })
    for (const r of recursos) {
      expect(r.porQue.trim(), `${r.titulo} sin justificación`).not.toBe('')
      expect(r.competencias.length, `${r.titulo} sin competencias mapeadas`).toBeGreaterThan(0)
    }
  })
})
