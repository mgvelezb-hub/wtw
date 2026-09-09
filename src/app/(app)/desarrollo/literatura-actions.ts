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
import { intentar, type Resultado } from '@/lib/resultado'

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

// "La propuesta necesita el insight" y "necesita la fuente" son correcciones que
// el usuario puede hacer; como excepción llegaban redactadas por Next.
export async function registrarPropuestaAction(
  input: RegistrarPropuestaInput
): Promise<Resultado<{ propuesta: PropuestaView }>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  return intentar(async () => {
    const propuesta = await registrarPropuesta(session.userId, input)
    revalidatePath('/desarrollo')
    return { propuesta }
  }, 'No se pudo registrar la propuesta.')
}

export async function actualizarPropuestaAction(
  id: string,
  cambio: ActualizarPropuestaInput
): Promise<Resultado> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  return intentar(async () => {
    await actualizarPropuesta(session.userId, id, cambio)
    revalidatePath('/desarrollo')
    return {}
  }, 'No se pudo actualizar la propuesta.')
}
