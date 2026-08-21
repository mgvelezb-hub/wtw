import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/api-auth'
import { POST } from '@/app/api/v1/evidence/route'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-evidence-route@vp.mx'
const OTRO_EMAIL = 'test-evidence-route-otro@vp.mx'
const TOKEN = 'wtw_test-evidence-route'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario() {
  return prisma.user.create({
    data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x', apiTokenHash: hashToken(TOKEN) },
  })
}

function post(body: unknown, token: string | null = TOKEN) {
  return POST(
    new Request('http://test/api/v1/evidence', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })
  )
}

describe('POST /api/v1/evidence', () => {
  it('rechaza sin token', async () => {
    await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({})
    const res = await post({ competencyId: competencia.id, nota: 'x' }, null)
    expect(res.status).toBe(401)
  })

  it('crea evidencia con testigo y nivelDemostrado válidos', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({
      competencyId: competencia.id,
      nota: 'presenté el glidepath al comité',
      testigo: 'Carlos Sierra',
      nivelDemostrado: 'Gerente',
    })

    expect(res.status).toBe(201)
    const guardada = await prisma.evidence.findFirstOrThrow({ where: { userId: user.id } })
    expect(guardada.testigo).toBe('Carlos Sierra')
    expect(guardada.nivelDemostrado).toBe('Gerente')
  })

  it('trimea testigo y guarda null cuando viene vacío — misma regla que la Server Action', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({ competencyId: competencia.id, nota: 'x', testigo: '  Carlos Sierra  ' })
    expect(res.status).toBe(201)

    const vacia = await post({ competencyId: competencia.id, nota: 'otra', testigo: '   ' })
    expect(vacia.status).toBe(201)

    const conTestigo = await prisma.evidence.findFirstOrThrow({ where: { userId: user.id, nota: 'x' } })
    expect(conTestigo.testigo).toBe('Carlos Sierra')
    const sinTestigo = await prisma.evidence.findFirstOrThrow({ where: { userId: user.id, nota: 'otra' } })
    expect(sinTestigo.testigo).toBeNull()
  })

  it('sin testigo ni nivel sigue funcionando igual que antes — los skills no los mandan', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({ competencyId: competencia.id, nota: 'solo nota' })

    expect(res.status).toBe(201)
    const guardada = await prisma.evidence.findFirstOrThrow({ where: { userId: user.id } })
    expect(guardada.testigo).toBeNull()
    expect(guardada.nivelDemostrado).toBeNull()
  })

  it('rechaza un nivel que no existe en el escalafón', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({ competencyId: competencia.id, nota: 'x', nivelDemostrado: 'gerente ' })

    expect(res.status).toBe(422)
    expect(await prisma.evidence.count({ where: { userId: user.id } })).toBe(0)
  })

  it('rechaza taskId de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: OTRO_EMAIL, nombre: 'Otro', passwordHash: 'x' } })
    const tareaAjena = await prisma.task.create({ data: { userId: otro.id, titulo: 'ajena' } })
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({ competencyId: competencia.id, nota: 'x', taskId: tareaAjena.id })

    expect(res.status).toBe(404)
    expect(await prisma.evidence.count({ where: { userId: user.id } })).toBe(0)
  })

  it('rechaza deliverableId de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: OTRO_EMAIL, nombre: 'Otro', passwordHash: 'x' } })
    const proyectoAjeno = await prisma.project.create({ data: { userId: otro.id, nombre: 'Ajeno' } })
    const entregableAjeno = await prisma.deliverable.create({
      data: { projectId: proyectoAjeno.id, nombre: 'Entregable ajeno' },
    })
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({ competencyId: competencia.id, nota: 'x', deliverableId: entregableAjeno.id })

    expect(res.status).toBe(404)
    expect(await prisma.evidence.count({ where: { userId: user.id } })).toBe(0)
  })

  it('acepta taskId y deliverableId propios', async () => {
    const user = await usuario()
    const proyecto = await prisma.project.create({ data: { userId: user.id, nombre: 'Propio' } })
    const entregable = await prisma.deliverable.create({ data: { projectId: proyecto.id, nombre: 'Entregable' } })
    const tarea = await prisma.task.create({ data: { userId: user.id, titulo: 'propia' } })
    const competencia = await prisma.competency.findFirstOrThrow({})

    const res = await post({
      competencyId: competencia.id,
      nota: 'x',
      taskId: tarea.id,
      deliverableId: entregable.id,
    })

    expect(res.status).toBe(201)
    const guardada = await prisma.evidence.findFirstOrThrow({ where: { userId: user.id } })
    expect(guardada.taskId).toBe(tarea.id)
    expect(guardada.deliverableId).toBe(entregable.id)
  })
})
