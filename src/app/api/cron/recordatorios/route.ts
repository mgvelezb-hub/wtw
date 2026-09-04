import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarAviso, leerRecordatorios, pushConfigurado, type Aviso } from '@/lib/push'
import { avisosDelTick, isoWeekAPlanear, type Momento } from '@/lib/recordatorios'
import { getCierreDia } from '@/app/(app)/cierre/service'

// Cron de recordatorios. Corre cada 15 min (vercel.json) y decide por persona:
// no hay una hora global, cada quien tiene su zona y su hora en Ajustes.
//
// Regla de fondo: un recordatorio que llega cuando la cosa YA está hecha educa
// a ignorarlo. Así que cada aviso se comprueba contra el estado real antes de
// mandarse —¿ya está planeada la semana?, ¿queda hueco sin explicar?— y si no
// hace falta, no se manda nada.

export const dynamic = 'force-dynamic'

function momentoLocal(zona: string, ahora: Date): Momento {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora)
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const weekday = partes.find((p) => p.type === 'weekday')!.value
  const h = Number(partes.find((p) => p.type === 'hour')!.value)
  const m = Number(partes.find((p) => p.type === 'minute')!.value)
  return { diaSemana: dias[weekday] ?? 0, minutos: h * 60 + m }
}

// La fecha de HOY en la zona de esa persona. `todayStr` está fijado a México y
// aquí se recorren usuarios que pueden estar en otra zona.
function fechaLocal(zona: string, ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(ahora)
}

async function avisoRitual(userId: string, ahora: Date, diaSemana: number): Promise<Aviso | null> {
  const isoWeek = isoWeekAPlanear(ahora, diaSemana)
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek } },
    select: { _count: { select: { wins: true, tasks: true } } },
  })
  // Un cascarón vacío (el que crea Mi Día para colgar juntas) no es un plan:
  // misma definición que usa el planeador para decidir si ya está planeada.
  const planeada = week !== null && (week._count.wins > 0 || week._count.tasks > 0)
  if (planeada) return null

  return {
    titulo: `Sin plan para la ${isoWeek.replace('-W', ' · semana ')}`,
    cuerpo: 'El ritual son 10 minutos: reflejar, definir Wins, dimensionar y bloquear.',
    ruta: '/semana/nueva',
    tag: `ritual-${isoWeek}`,
  }
}

async function avisoCierre(userId: string, hoy: string): Promise<Aviso | null> {
  const cierre = await getCierreDia(userId, hoy)
  if (cierre.yaReconciliado) return null
  // Sin plan del día no hay nada que reconciliar: avisar ahí sería pedirle
  // cerrar un día que nunca se abrió.
  if (cierre.planMin === 0) return null

  const sinExplicar = Math.max(0, cierre.huecoMin - cierre.explicadoMin)
  if (sinExplicar < 15) return null

  return {
    titulo: `${Math.round(sinExplicar)} min del día sin explicar`,
    cuerpo: 'Clasificar por qué se rompió el plan toma un minuto y es lo que alimenta tu factor.',
    ruta: '/cierre',
    tag: `cierre-${hoy}`,
  }
}

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

  const resumen: Array<{ userId: string; tipo: string; enviados: number }> = []

  for (const u of usuarios) {
    const r = leerRecordatorios(u.recordatorios)
    const momento = momentoLocal(u.timezone, ahora)
    for (const tipo of avisosDelTick(r, momento)) {
      const aviso =
        tipo === 'ritual'
          ? await avisoRitual(u.id, ahora, momento.diaSemana)
          : await avisoCierre(u.id, fechaLocal(u.timezone, ahora))
      if (!aviso) continue
      const { enviados } = await enviarAviso(u.id, aviso, origen)
      resumen.push({ userId: u.id, tipo, enviados })
    }
  }

  return NextResponse.json({ ok: true, avisos: resumen })
}
