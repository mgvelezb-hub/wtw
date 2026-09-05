import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarAviso, leerRecordatorios, pushConfigurado } from '@/lib/push'
import { avisosDelTick, tickUnicoActivo } from '@/lib/recordatorios'
import { avisoCierre, avisoRitual, fechaLocal, momentoLocal } from '@/lib/avisos'

// Cron de recordatorios. Decide por persona: no hay una hora global, cada quien
// tiene su zona y su hora en Ajustes.
//
// El plan Hobby de Vercel permite UN disparo al día, así que hoy el schedule es
// diario a las 23:30 UTC (17:30 en México) y la hora configurada se ignora: el
// aviso llega en el único tick que hay. Con plan Pro se cambian dos cosas a la
// vez, el schedule de `vercel.json` a cada 15 min y `RECORDATORIOS_TICK_UNICO=0`,
// y la hora vuelve a respetarse.
//
// Regla de fondo: un recordatorio que llega cuando la cosa YA está hecha educa
// a ignorarlo. Así que cada aviso se comprueba contra el estado real antes de
// mandarse —¿ya está planeada la semana?, ¿queda hueco sin explicar?— y si no
// hace falta, no se manda nada.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // El secreto del cron es obligatorio: esta ruta manda notificaciones y no
  // puede quedar abierta a quien la descubra. Vercel Cron manda el header
  // Authorization con CRON_SECRET.
  const secreto = process.env.CRON_SECRET
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  if (!pushConfigurado()) return NextResponse.json({ error: 'push sin configurar' }, { status: 503 })

  const origen = process.env.APP_ORIGIN ?? new URL(req.url).origin
  const ahora = new Date()

  // Solo quien tiene al menos un dispositivo suscrito: sin dispositivo, calcular
  // su estado es trabajo que nadie va a leer.
  const usuarios = await prisma.user.findMany({
    where: { pushSubs: { some: {} } },
    select: { id: true, timezone: true, recordatorios: true },
  })

  const tickUnico = tickUnicoActivo(process.env)
  const resumen: Array<{ userId: string; tipo: string; enviados: number }> = []

  for (const u of usuarios) {
    const r = leerRecordatorios(u.recordatorios)
    const momento = momentoLocal(u.timezone, ahora)
    for (const tipo of avisosDelTick(r, momento, { tickUnico })) {
      const aviso =
        tipo === 'ritual'
          ? await avisoRitual(u.id, ahora, momento.diaSemana)
          : await avisoCierre(u.id, fechaLocal(u.timezone, ahora))
      if (!aviso) continue
      const { enviados } = await enviarAviso(u.id, aviso, origen)
      resumen.push({ userId: u.id, tipo, enviados })
    }
  }

  return NextResponse.json({ ok: true, tickUnico, avisos: resumen })
}
