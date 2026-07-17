import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createMinuta, listMinutas, addItem, updateItem, promoteItem } from '@/app/api/v1/minutas/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-minutas@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function seedUserAndProject() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
  const project = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool ET' } })
  return { user, project }
}

describe('createMinuta', () => {
  it('crea una minuta suelta (sin blockId ni calendarEventId)', async () => {
    const { user, project } = await seedUserAndProject()

    const minuta = await createMinuta({
      userId: user.id,
      projectId: project.id,
      fecha: '2026-07-15',
      titulo: 'Status semanal',
      asistentes: ['Carlos', 'Alan'],
    })

    expect(minuta.projectId).toBe(project.id)
    expect(minuta.blockId).toBeNull()
    expect(minuta.calendarEventId).toBeNull()
    expect(minuta.asistentes).toEqual(['Carlos', 'Alan'])
    expect(minuta.items).toEqual([])
  })

  it('crea una minuta ligada a un block de junta', async () => {
    const { user, project } = await seedUserAndProject()
    const week = await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W29', rangoInicio: new Date('2026-07-13'), rangoFin: new Date('2026-07-19'), factorUsado: 1.4 },
    })
    const block = await prisma.block.create({
      data: { weekId: week.id, fecha: new Date('2026-07-15'), inicio: '09:00', fin: '10:00', tipo: 'junta', titulo: 'Status Liverpool', planMin: 60 },
    })

    const minuta = await createMinuta({
      userId: user.id,
      projectId: project.id,
      blockId: block.id,
      fecha: '2026-07-15',
      titulo: 'Status Liverpool',
      asistentes: ['Carlos'],
    })

    expect(minuta.blockId).toBe(block.id)
  })

  it('rechaza un proyecto que no pertenece al usuario', async () => {
    const { user } = await seedUserAndProject()
    const otro = await prisma.user.create({ data: { email: 'otro-minutas@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const ajeno = await prisma.project.create({ data: { userId: otro.id, nombre: 'Ajeno' } })

    await expect(
      createMinuta({ userId: user.id, projectId: ajeno.id, fecha: '2026-07-15', titulo: 'X', asistentes: [] })
    ).rejects.toThrow()

    await prisma.project.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })
})

describe('listMinutas', () => {
  it('lista minutas del proyecto con items, ordenadas por fecha desc', async () => {
    const { user, project } = await seedUserAndProject()
    const m1 = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-08', titulo: 'Semana 28', asistentes: [] })
    const m2 = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Semana 29', asistentes: [] })
    await addItem(user.id, m1.id, { tipo: 'nota', texto: 'nota vieja' })

    const minutas = await listMinutas(user.id, project.id)

    expect(minutas).toHaveLength(2)
    expect(minutas[0].id).toBe(m2.id)
    expect(minutas[1].id).toBe(m1.id)
    expect(minutas[1].items).toHaveLength(1)
  })
})

describe('addItem / updateItem', () => {
  it('agrega un item y permite actualizar campos parciales', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })

    const item = await addItem(user.id, minuta.id, { tipo: 'pendiente_cliente', texto: 'Esperar respuesta de Mario', responsable: 'Mario' })
    expect(item.tipo).toBe('pendiente_cliente')
    expect(item.estado).toBe('abierto')

    const updated = await updateItem(user.id, item.id, { estado: 'cerrado', responsable: 'Mario Diaz' })
    expect(updated.estado).toBe('cerrado')
    expect(updated.responsable).toBe('Mario Diaz')
  })
})

describe('promoteItem', () => {
  it('promueve pendiente_nuestro a Task backlog con alcance sow', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'pendiente_nuestro', texto: 'Actualizar KPIs' })

    const promoted = await promoteItem(user.id, item.id)

    expect(promoted.estado).toBe('convertido')
    expect(promoted.taskId).not.toBeNull()
    const task = await prisma.task.findUnique({ where: { id: promoted.taskId! } })
    expect(task!.titulo).toBe('Actualizar KPIs')
    expect(task!.estatus).toBe('backlog')
    expect(task!.alcance).toBe('sow')
    expect(task!.projectId).toBe(project.id)
    expect(task!.userId).toBe(user.id)
  })

  it('promueve actividad_nueva a Task backlog con alcance sow por default', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'actividad_nueva', texto: 'Reloj operativo' })

    const promoted = await promoteItem(user.id, item.id)
    const task = await prisma.task.findUnique({ where: { id: promoted.taskId! } })
    expect(task!.alcance).toBe('sow')
  })

  it('promueve pendiente_cliente a Issue tipo pendiente con responsable y fecha', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, {
      tipo: 'pendiente_cliente',
      texto: 'Sigue sin respuesta de Mario sobre visita',
      responsable: 'Mario',
      fechaCompromiso: '2026-07-20',
    })

    const promoted = await promoteItem(user.id, item.id)

    expect(promoted.issueId).not.toBeNull()
    const issue = await prisma.issue.findUnique({ where: { id: promoted.issueId! } })
    expect(issue!.tipo).toBe('pendiente')
    expect(issue!.tema).toBeNull()
    expect(issue!.responsable).toBe('Mario')
    expect(issue!.fechaCompromiso?.toISOString().slice(0, 10)).toBe('2026-07-20')
    expect(issue!.projectId).toBe(project.id)
  })

  it('promueve solicitud_data a Issue tipo pendiente con tema data', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'solicitud_data', texto: 'Pedir base actualizada de ventanas', responsable: 'Noe' })

    const promoted = await promoteItem(user.id, item.id)
    const issue = await prisma.issue.findUnique({ where: { id: promoted.issueId! } })
    expect(issue!.tipo).toBe('pendiente')
    expect(issue!.tema).toBe('data')
    expect(issue!.responsable).toBe('Noe')
  })

  it('promueve riesgo a Issue tipo riesgo', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'riesgo', texto: 'Data 2026 podría no cerrar a tiempo' })

    const promoted = await promoteItem(user.id, item.id)
    const issue = await prisma.issue.findUnique({ where: { id: promoted.issueId! } })
    expect(issue!.tipo).toBe('riesgo')
  })

  it('promueve acuerdo a Issue tipo acuerdo sin requerir responsable', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'acuerdo', texto: 'Foco en paquetes de negociación' })

    const promoted = await promoteItem(user.id, item.id)
    const issue = await prisma.issue.findUnique({ where: { id: promoted.issueId! } })
    expect(issue!.tipo).toBe('acuerdo')
    expect(issue!.responsable).toBeNull()
  })

  it('promueve decision a Issue tipo decision sin requerir responsable', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'decision', texto: 'Usar forecast a nivel viaje' })

    const promoted = await promoteItem(user.id, item.id)
    const issue = await prisma.issue.findUnique({ where: { id: promoted.issueId! } })
    expect(issue!.tipo).toBe('decision')
  })

  it('rechaza promover un item ya convertido', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'decision', texto: 'Decision X' })

    await promoteItem(user.id, item.id)
    await expect(promoteItem(user.id, item.id)).rejects.toThrow()
  })

  it('rechaza promover un item de tipo nota', async () => {
    const { user, project } = await seedUserAndProject()
    const minuta = await createMinuta({ userId: user.id, projectId: project.id, fecha: '2026-07-15', titulo: 'Status', asistentes: [] })
    const item = await addItem(user.id, minuta.id, { tipo: 'nota', texto: 'solo una nota' })

    await expect(promoteItem(user.id, item.id)).rejects.toThrow()
  })
})
