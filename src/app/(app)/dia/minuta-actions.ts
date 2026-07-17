'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMinuta, promoteItem } from '@/app/api/v1/minutas/service'
import type { MinutaItemEstado, MinutaItemTipo } from '@prisma/client'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export type MinutaItemView = {
  id: string
  tipo: MinutaItemTipo
  texto: string
  responsable: string | null
  fechaCompromiso: string | null
  estado: MinutaItemEstado
}

export type MinutaView = {
  id: string
  titulo: string
  asistentes: string[]
  items: MinutaItemView[]
}

function toView(minuta: {
  id: string
  titulo: string
  asistentes: string[]
  items: {
    id: string
    tipo: MinutaItemTipo
    texto: string
    responsable: string | null
    fechaCompromiso: Date | null
    estado: MinutaItemEstado
  }[]
}): MinutaView {
  return {
    id: minuta.id,
    titulo: minuta.titulo,
    asistentes: minuta.asistentes,
    items: minuta.items.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      texto: i.texto,
      responsable: i.responsable,
      fechaCompromiso: i.fechaCompromiso ? i.fechaCompromiso.toISOString().slice(0, 10) : null,
      estado: i.estado,
    })),
  }
}

// Busca la minuta ya capturada de una junta — por blockId (bloque interno tipo
// junta) o por calendarEventId (junta de Outlook). Null si aún no existe: el
// drawer arranca en modo "primera captura".
export async function getMinutaExistenteAction(target: {
  blockId?: string
  calendarEventId?: string
}): Promise<MinutaView | null> {
  const uid = await userId()
  if (!target.blockId && !target.calendarEventId) return null
  const minuta = await prisma.minuta.findFirst({
    where: {
      project: { userId: uid },
      ...(target.blockId ? { blockId: target.blockId } : { calendarEventId: target.calendarEventId }),
    },
    include: { items: { orderBy: { orden: 'asc' } } },
  })
  return minuta ? toView(minuta) : null
}

// Sugerencias de asistentes para autocompletar el chip de la junta: nombres ya
// usados en minutas previas del mismo proyecto (§6 Tarea 6 del plan de fase 7).
export async function getAsistentesSugeridosAction(projectId: string): Promise<string[]> {
  const uid = await userId()
  const minutas = await prisma.minuta.findMany({
    where: { projectId, project: { userId: uid } },
    select: { asistentes: true },
  })
  const set = new Set<string>()
  for (const m of minutas) for (const nombre of m.asistentes) set.add(nombre)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export type GuardarItemInput = {
  minutaId: string | null
  projectId: string
  blockId?: string
  calendarEventId?: string
  fecha: string
  titulo: string
  asistentes: string[]
  item: {
    tipo: MinutaItemTipo
    texto: string
    responsable?: string
    fechaCompromiso?: string
  }
}

// Guarda un item de la minuta en una sola interacción: si la junta aún no
// tiene minuta, la crea de forma lazy (al guardar el PRIMER item, no al abrir
// el drawer) y acto seguido agrega el item — contrato de captura ≤10 seg/item
// (§1, §6 Tarea 6). El drawer permanece abierto para el siguiente item.
export async function guardarItemAction(input: GuardarItemInput): Promise<MinutaView> {
  const uid = await userId()

  let minutaId = input.minutaId
  if (!minutaId) {
    const creada = await createMinuta({
      userId: uid,
      projectId: input.projectId,
      blockId: input.blockId,
      calendarEventId: input.calendarEventId,
      fecha: input.fecha,
      titulo: input.titulo,
      asistentes: input.asistentes,
    })
    minutaId = creada.id
  }

  const orden = await prisma.minutaItem.count({ where: { minutaId } })
  await prisma.minutaItem.create({
    data: {
      minutaId,
      tipo: input.item.tipo,
      texto: input.item.texto,
      responsable: input.item.responsable || undefined,
      fechaCompromiso: input.item.fechaCompromiso ? new Date(input.item.fechaCompromiso) : undefined,
      orden,
    },
  })

  const full = await prisma.minuta.findUniqueOrThrow({
    where: { id: minutaId },
    include: { items: { orderBy: { orden: 'asc' } } },
  })
  revalidatePath('/dia')
  return toView(full)
}

// Actualiza la lista de asistentes de una minuta ya creada (chips de texto
// libre, agregados durante la junta según se van sumando personas).
export async function actualizarAsistentesAction(minutaId: string, asistentes: string[]): Promise<void> {
  const uid = await userId()
  const minuta = await prisma.minuta.findUnique({ where: { id: minutaId }, include: { project: true } })
  if (!minuta || minuta.project.userId !== uid) throw new Error('minuta no encontrada')
  await prisma.minuta.update({ where: { id: minutaId }, data: { asistentes } })
  revalidatePath('/dia')
}

// Promueve un item a Task o Issue según su tipo (delegado al service — nunca
// se duplica la lógica de destino aquí).
export async function promoverItemAction(itemId: string): Promise<MinutaView> {
  const uid = await userId()
  const item = await promoteItem(uid, itemId)
  const full = await prisma.minuta.findUniqueOrThrow({
    where: { id: item.minutaId },
    include: { items: { orderBy: { orden: 'asc' } } },
  })
  revalidatePath('/dia')
  return toView(full)
}
