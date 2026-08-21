'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import {
  registrarPropuesta,
  actualizarPropuesta,
  listarPropuestas,
  type RegistrarPropuestaInput,
  type ActualizarPropuestaInput,
  type PropuestaView,
} from './literatura-service'

// Escritura y lectura del log de propuestas desde literatura (reactivo 11 de
// Gerente). DesarrolloBoard es un Client Component y no puede tocar Prisma
// directamente, así que trae su propia lista con `listarPropuestasAction` en
// vez de recibirla como prop — mismo patrón que MinutaDrawer con
// `getMinutaExistenteAction`.

export async function listarPropuestasAction(): Promise<PropuestaView[]> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  return listarPropuestas(session.userId)
}

export async function registrarPropuestaAction(input: RegistrarPropuestaInput): Promise<PropuestaView> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const propuesta = await registrarPropuesta(session.userId, input)
  revalidatePath('/desarrollo')
  return propuesta
}

export async function actualizarPropuestaAction(id: string, cambio: ActualizarPropuestaInput): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  await actualizarPropuesta(session.userId, id, cambio)
  revalidatePath('/desarrollo')
}
