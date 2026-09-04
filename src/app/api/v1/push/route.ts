import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clavePublica, pushConfigurado } from '@/lib/push'

// La clave pública VAPID que el navegador necesita para suscribirse. Es
// pública por definición —va dentro de la petición de suscripción— pero se
// sirve por aquí y no como NEXT_PUBLIC_* para que el cliente pueda distinguir
// "push apagado en este despliegue" de "clave mal escrita".
export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const subs = await prisma.pushSub.count({ where: { userId: session.userId } })
  return NextResponse.json({ configurado: pushConfigurado(), clavePublica: clavePublica(), dispositivos: subs })
}

// Alta de un dispositivo. Es idempotente por endpoint: el navegador puede
// devolver la MISMA suscripción tras un reinicio, y duplicarla mandaría el
// aviso dos veces al mismo iPad.
export async function POST(req: Request) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : null
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : null
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'suscripción incompleta' }, { status: 400 })
  }

  await prisma.pushSub.upsert({
    where: { endpoint },
    create: {
      userId: session.userId,
      endpoint,
      p256dh,
      auth,
      etiqueta: typeof body?.etiqueta === 'string' ? body.etiqueta.slice(0, 80) : null,
    },
    // Un endpoint que reaparece se reasigna al usuario de la sesión: es el mismo
    // navegador, y puede haber cambiado de cuenta en él.
    update: { userId: session.userId, p256dh, auth },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null

  // Sin endpoint se borran TODOS los dispositivos de la persona ("apagar los
  // recordatorios en todas partes"); con endpoint, solo este. En los dos casos
  // el filtro lleva userId (regla 4).
  const { count } = await prisma.pushSub.deleteMany({
    where: endpoint ? { userId: session.userId, endpoint } : { userId: session.userId },
  })
  return NextResponse.json({ borrados: count })
}
