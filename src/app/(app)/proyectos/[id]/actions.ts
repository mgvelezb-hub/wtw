'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { marcarPresentado, registrarImpacto } from './service'

export async function marcarPresentadoAction(
  projectId: string,
  deliverableId: string,
  presentado: boolean,
  presentadoA?: string,
): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  await marcarPresentado(session.userId, deliverableId, presentado, presentadoA)

  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath('/desarrollo')
}

export async function registrarImpactoAction(
  projectId: string,
  deliverableId: string,
  data: { baseline: string; delta: string; validadoPor?: string; nota?: string },
): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  await registrarImpacto(session.userId, deliverableId, data)

  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath('/desarrollo')
}
