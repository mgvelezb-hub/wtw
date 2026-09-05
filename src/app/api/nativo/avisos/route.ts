import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { leerRecordatorios } from '@/lib/push'
import { estadoAvisos } from '@/lib/avisos'
import { planLocal } from '@/lib/avisos-locales'

// Lo que el cascarón nativo debe tener programado en el dispositivo AHORA.
// Se llama con la cookie de sesión de la web (el WKWebView la manda solo), no
// con el PAT: es la misma persona en la misma UI, solo que envuelta.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { timezone: true, recordatorios: true },
  })
  const ahora = new Date()
  const estado = await estadoAvisos(session.userId, user.timezone, ahora)
  const avisos = planLocal(leerRecordatorios(user.recordatorios), ahora, user.timezone, estado)
  return NextResponse.json({ avisos, calculadoEn: ahora.toISOString() })
}
