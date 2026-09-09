'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { inviteColleague, type ResultadoInvitacion } from './service'

// Devuelve `{ok, error}` en vez de lanzar: el caso más probable —"ese correo ya
// tiene cuenta"— no es una excepción, es una respuesta, y como excepción dejaba
// la UI colgada sin decir nada.
export async function inviteColleagueAction(email: string, nombre: string): Promise<ResultadoInvitacion> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }
  const resultado = await inviteColleague(session.userId, email, nombre)
  if (resultado.ok) revalidatePath('/equipo')
  return resultado
}
