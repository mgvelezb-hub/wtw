'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Registro de evidencia desde la UI. Hasta ahora Evidence solo se podía crear vía
// POST /api/v1/evidence — es decir, la rúbrica de 48 reactivos existía sin ninguna
// forma de alimentarla desde la app. Ver docs/plans/2026-08-10-alineacion-council.md §Fase 2b.

export async function registrarEvidenciaAction(input: {
  competencyId: string
  nota: string
  taskId?: string
  deliverableId?: string
}) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const nota = input.nota.trim()
  if (nota === '') throw new Error('la evidencia necesita una nota')

  // Ownership: una evidencia solo puede colgar de trabajo propio. Sin esto, un id
  // ajeno permitiría acreditarse el trabajo de otro usuario.
  if (input.taskId) {
    const task = await prisma.task.findFirst({ where: { id: input.taskId, userId: session.userId }, select: { id: true } })
    if (!task) throw new Error('tarea no encontrada')
  }
  if (input.deliverableId) {
    const entregable = await prisma.deliverable.findFirst({
      where: { id: input.deliverableId, project: { userId: session.userId } },
      select: { id: true },
    })
    if (!entregable) throw new Error('entregable no encontrado')
  }

  await prisma.evidence.create({
    data: {
      userId: session.userId,
      competencyId: input.competencyId,
      taskId: input.taskId,
      deliverableId: input.deliverableId,
      nota,
    },
  })

  revalidatePath('/desarrollo')
  revalidatePath('/dia')
}

export async function borrarEvidenciaAction(evidenceId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.evidence.deleteMany({ where: { id: evidenceId, userId: session.userId } })
  if (count === 0) throw new Error('evidencia no encontrada')

  revalidatePath('/desarrollo')
}

// Bitácora de delegación. Marcar que una tarea la hizo Mau pero debió hacerla un
// perfil más junior. El valor no está en la marca suelta: está en la lista
// acumulada como caso de negocio con VP para pedir un reporte.
export async function marcarDelegableAction(taskId: string, delegable: boolean, nota?: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.task.updateMany({
    where: { id: taskId, userId: session.userId },
    data: { delegable, delegableNota: delegable ? (nota?.trim() || null) : null },
  })
  if (count === 0) throw new Error('tarea no encontrada')

  revalidatePath('/dia')
  revalidatePath('/desarrollo')
}

// Progreso del catálogo. Un catálogo sin consumo medible es otro tablero vacío:
// el estado es lo que distingue "no lo he tocado" de "lo hice".
export async function marcarRecursoAction(resourceId: string, estado: 'pendiente' | 'en_curso' | 'hecho' | 'descartado') {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const ahora = new Date()
  const previo = await prisma.learningProgress.findUnique({
    where: { userId_resourceId: { userId: session.userId, resourceId } },
    select: { iniciado: true },
  })

  await prisma.learningProgress.upsert({
    where: { userId_resourceId: { userId: session.userId, resourceId } },
    create: {
      userId: session.userId,
      resourceId,
      estado,
      iniciado: estado === 'en_curso' ? ahora : null,
      terminado: estado === 'hecho' ? ahora : null,
    },
    update: {
      estado,
      // `iniciado` se sella una sola vez: si ya arrancó, volver a marcarlo en
      // curso no debe borrar cuánto llevas con él.
      ...(estado === 'en_curso' && previo?.iniciado === null ? { iniciado: ahora } : {}),
      ...(estado === 'hecho' ? { terminado: ahora } : {}),
    },
  })

  revalidatePath('/desarrollo')
}

// Los ejercicios recurrentes no se "terminan": se practican. El contador es la
// unica medida honesta de si la practica deliberada esta ocurriendo.
export async function practicarRecursoAction(resourceId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  await prisma.learningProgress.upsert({
    where: { userId_resourceId: { userId: session.userId, resourceId } },
    create: { userId: session.userId, resourceId, estado: 'en_curso', veces: 1, iniciado: new Date() },
    update: { veces: { increment: 1 }, estado: 'en_curso' },
  })

  revalidatePath('/desarrollo')
}
