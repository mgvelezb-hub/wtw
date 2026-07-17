import { prisma } from '@/lib/prisma'
import type { IssueTipo, MinutaItemEstado, MinutaItemTipo } from '@prisma/client'

export type CreateMinutaInput = {
  userId: string
  projectId: string
  blockId?: string
  calendarEventId?: string
  fecha: string
  titulo: string
  asistentes: string[]
  notas?: string
}

export type AddItemInput = {
  tipo: MinutaItemTipo
  texto: string
  responsable?: string
  responsableUserId?: string
  fechaCompromiso?: string
  orden?: number
}

export type UpdateItemInput = Partial<{
  tipo: MinutaItemTipo
  texto: string
  responsable: string | null
  responsableUserId: string | null
  fechaCompromiso: string | null
  estado: MinutaItemEstado
  orden: number
}>

// Verifica que el proyecto exista y pertenezca al usuario autenticado — mismo
// criterio de dueño único usado en el resto de la app (Project.userId).
async function assertProjectOwnership(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== userId) throw new Error('proyecto no encontrado')
  return project
}

async function getOwnedMinuta(userId: string, minutaId: string) {
  const minuta = await prisma.minuta.findUnique({ where: { id: minutaId }, include: { project: true } })
  if (!minuta || minuta.project.userId !== userId) throw new Error('minuta no encontrada')
  return minuta
}

async function getOwnedItem(userId: string, itemId: string) {
  const item = await prisma.minutaItem.findUnique({
    where: { id: itemId },
    include: { minuta: { include: { project: true } } },
  })
  if (!item || item.minuta.project.userId !== userId) throw new Error('item de minuta no encontrado')
  return item
}

export async function createMinuta(input: CreateMinutaInput) {
  await assertProjectOwnership(input.userId, input.projectId)
  return prisma.minuta.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      blockId: input.blockId,
      calendarEventId: input.calendarEventId,
      fecha: new Date(input.fecha),
      titulo: input.titulo,
      asistentes: input.asistentes,
      notas: input.notas,
    },
    include: { items: true },
  })
}

export async function listMinutas(userId: string, projectId: string) {
  await assertProjectOwnership(userId, projectId)
  return prisma.minuta.findMany({
    where: { projectId },
    include: { items: { orderBy: { orden: 'asc' } } },
    orderBy: { fecha: 'desc' },
  })
}

export async function addItem(userId: string, minutaId: string, input: AddItemInput) {
  await getOwnedMinuta(userId, minutaId)
  return prisma.minutaItem.create({
    data: {
      minutaId,
      tipo: input.tipo,
      texto: input.texto,
      responsable: input.responsable,
      responsableUserId: input.responsableUserId,
      fechaCompromiso: input.fechaCompromiso ? new Date(input.fechaCompromiso) : undefined,
      orden: input.orden ?? 0,
    },
  })
}

export async function updateItem(userId: string, itemId: string, input: UpdateItemInput) {
  await getOwnedItem(userId, itemId)
  return prisma.minutaItem.update({
    where: { id: itemId },
    data: {
      tipo: input.tipo,
      texto: input.texto,
      responsable: input.responsable,
      responsableUserId: input.responsableUserId,
      fechaCompromiso:
        input.fechaCompromiso === undefined ? undefined : input.fechaCompromiso ? new Date(input.fechaCompromiso) : null,
      estado: input.estado,
      orden: input.orden,
    },
  })
}

// Mapa tipo de item → tipo de Issue destino, para las familias RAID (todo lo
// que no es accionable interno). `tema` solo aplica al caso especial de
// solicitud_data (§6 Tarea 2 del plan de fase 7).
function issueTipoParaItem(tipo: MinutaItemTipo): { issueTipo: IssueTipo; tema?: string } {
  switch (tipo) {
    case 'pendiente_cliente':
      return { issueTipo: 'pendiente' }
    case 'solicitud_data':
      return { issueTipo: 'pendiente', tema: 'data' }
    case 'riesgo':
      return { issueTipo: 'riesgo' }
    case 'acuerdo':
      return { issueTipo: 'acuerdo' }
    case 'decision':
      return { issueTipo: 'decision' }
    default:
      throw new Error(`tipo de item no promovible a issue: ${tipo}`)
  }
}

// Promueve un MinutaItem a su destino (Task o Issue) según su tipo. El item
// nunca se borra: queda estado=convertido con el FK al destino, conservando
// el registro histórico de la minuta.
export async function promoteItem(userId: string, itemId: string) {
  const item = await getOwnedItem(userId, itemId)

  if (item.estado === 'convertido') throw new Error('el item ya fue promovido')
  if (item.tipo === 'nota') throw new Error('un item de tipo nota no es promovible')

  const { projectId, userId: minutaUserId } = item.minuta

  if (item.tipo === 'pendiente_nuestro' || item.tipo === 'actividad_nueva') {
    const task = await prisma.task.create({
      data: {
        userId: minutaUserId,
        projectId,
        titulo: item.texto,
        estatus: 'backlog',
        alcance: 'sow',
      },
    })
    return prisma.minutaItem.update({ where: { id: itemId }, data: { estado: 'convertido', taskId: task.id } })
  }

  const { issueTipo, tema } = issueTipoParaItem(item.tipo)
  const issue = await prisma.issue.create({
    data: {
      projectId,
      tipo: issueTipo,
      tema,
      descripcion: item.texto,
      responsable: item.responsable ?? undefined,
      fechaCompromiso: item.fechaCompromiso ?? undefined,
    },
  })
  return prisma.minutaItem.update({ where: { id: itemId }, data: { estado: 'convertido', issueId: issue.id } })
}
