'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { createManualEntry, editEntry, setMeasuredMinutes } from './service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function createManualEntryAction(taskId: string, minutos: number) {
  await createManualEntry(taskId, await userId(), Math.round(minutos * 60))
  revalidatePath('/dia')
}

export async function editEntryAction(entryId: string, minutos: number) {
  await editEntry(entryId, await userId(), Math.round(minutos * 60))
  revalidatePath('/dia')
}

// Corrige el tiempo medido de una tarea aunque ya esté terminada: el cronómetro
// olvidado se descubre después, no durante.
export async function corregirTiempoMedidoAction(taskId: string, minutos: number) {
  await setMeasuredMinutes(taskId, await userId(), Math.round(minutos * 60))
  revalidatePath('/dia')
  revalidatePath('/cierre')
}
