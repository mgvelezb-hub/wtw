'use server'

import { revalidatePath } from 'next/cache'
import type { DesvioCausa } from '@prisma/client'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pasarPendientes, convertirDesvioEnTarea } from './service'

export type DesvioInput = {
  causa: DesvioCausa
  minutos: number
  stakeholderId?: string
  taskId?: string
  nota?: string
}

// Guarda el cierre del día completo: la reconciliación y sus desvíos se
// reemplazan de una vez. Es un formulario de 60 s que se corrige en el momento,
// no un log incremental — hacerlo incremental obligaría a borrar renglón por
// renglón para arreglar un dedazo.
export async function guardarCierreAction(input: {
  fecha: string
  desvios: DesvioInput[]
  nota?: string
}): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const fecha = new Date(input.fecha)
  if (Number.isNaN(fecha.getTime())) throw new Error('fecha inválida')

  // Minutos en cero o negativos no explican nada y ensuciarían el patrón, que es
  // el único entregable de esta pantalla.
  const desvios = input.desvios.filter((d) => d.minutos > 0)

  // Ownership de todo lo que se referencia. Sin esto, un id ajeno colgaría el
  // desvío de la tarea o el stakeholder de otro usuario.
  const stakeholderIds = [...new Set(desvios.map((d) => d.stakeholderId).filter((id): id is string => Boolean(id)))]
  const taskIds = [...new Set(desvios.map((d) => d.taskId).filter((id): id is string => Boolean(id)))]

  const [stakeholdersOk, tareasOk] = await Promise.all([
    stakeholderIds.length > 0
      ? prisma.stakeholder.findMany({ where: { id: { in: stakeholderIds }, userId: session.userId }, select: { id: true } })
      : [],
    taskIds.length > 0
      ? prisma.task.findMany({ where: { id: { in: taskIds }, userId: session.userId }, select: { id: true } })
      : [],
  ])
  if (stakeholdersOk.length !== stakeholderIds.length) throw new Error('stakeholder no encontrado')
  if (tareasOk.length !== taskIds.length) throw new Error('tarea no encontrada')

  await prisma.$transaction(async (tx) => {
    const cierre = await tx.dayReconciliation.upsert({
      where: { userId_fecha: { userId: session.userId, fecha } },
      create: { userId: session.userId, fecha, nota: input.nota?.trim() || null },
      update: { nota: input.nota?.trim() || null },
    })

    await tx.desvio.deleteMany({ where: { reconciliationId: cierre.id } })

    for (const [orden, d] of desvios.entries()) {
      await tx.desvio.create({
        data: {
          reconciliationId: cierre.id,
          causa: d.causa,
          minutos: Math.round(d.minutos),
          // El stakeholder solo tiene sentido en las causas que vienen de fuera.
          // Guardarlo en "trabajé sin cronómetro" ensuciaría el origen de las
          // urgencias, que es el argumento con el cliente.
          stakeholderId:
            d.causa === 'bomberazo' || d.causa === 'cambio_prioridad_cliente' ? (d.stakeholderId ?? null) : null,
          taskId: d.taskId ?? null,
          nota: d.nota?.trim() || null,
          orden,
        },
      })
    }
  })

  revalidatePath('/cierre')
  revalidatePath('/dia')
}

// Mover pendientes y convertir un desvío en trabajo viven en `service.ts`: la
// regla de arquitectura del proyecto es que las dos capas de auth (cookie de
// sesión y PAT) llamen la MISMA lógica, y además así se puede probar sin sesión.
export async function pasarPendientesAction(fecha: string): Promise<{ movidos: number; hacia: string }> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const r = await pasarPendientes(session.userId, fecha)
  revalidatePath('/cierre')
  revalidatePath('/dia')
  return r
}

export async function convertirDesvioEnTareaAction(input: {
  titulo: string
  minutos: number
  projectId: string
  alcance: 'aliado' | 'sow'
  dolorCliente?: string
  fecha: string
}): Promise<{ taskId: string }> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const r = await convertirDesvioEnTarea(session.userId, input)
  revalidatePath('/cierre')
  revalidatePath('/aliado')
  revalidatePath('/dia')
  return r
}

// Deshacer un cierre. Vuelve al estado "sin reconciliar", que es distinto de
// "reconciliado sin desvíos" — este último significa que el plan se cumplió.
export async function borrarCierreAction(fecha: string): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.dayReconciliation.deleteMany({
    where: { userId: session.userId, fecha: new Date(fecha) },
  })
  if (count === 0) throw new Error('no hay cierre para esa fecha')

  revalidatePath('/cierre')
  revalidatePath('/dia')
}
