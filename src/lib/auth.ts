import 'server-only'
import { cookies } from 'next/headers'
import { decrypt } from './session'
import { prisma } from './prisma'

export async function verifySession(): Promise<{ userId: string; exp: number } | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)
  if (!session) return null

  // El proxy (Edge runtime, sin acceso a DB) solo valida la firma del JWT —
  // una cuenta borrada con cookie aún vigente pasaría el proxy. Verificar
  // aquí (Node runtime) que el usuario sigue existiendo evita 500s en
  // páginas que hacen findUniqueOrThrow con session.userId.
  const exists = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } })
  return exists ? session : null
}
