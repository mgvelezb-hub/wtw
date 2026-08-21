'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { marcarPresentado } from './service'

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
