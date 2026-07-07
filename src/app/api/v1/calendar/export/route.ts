import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isoWeekOf } from '@/lib/dates'

function dt(fecha: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':')
  const y = fecha.getUTCFullYear()
  const mo = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const d = String(fecha.getUTCDate()).padStart(2, '0')
  return `${y}${mo}${d}T${(h || '00').padStart(2, '0')}${(m || '00').padStart(2, '0')}00`
}

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

// Exporta los bloques de la semana en curso como .ics (hora local flotante,
// Outlook la interpreta en la zona del usuario). Autenticado por cookie de
// sesión — es una navegación del navegador, no una llamada de skill con PAT.
export async function GET() {
  const session = await verifySession()
  if (!session) return new Response('unauthorized', { status: 401 })

  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId: session.userId, isoWeek: isoWeekOf(new Date()) } },
    include: { blocks: { orderBy: [{ fecha: 'asc' }, { orden: 'asc' }] } },
  })

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WTW App//ES', 'CALSCALE:GREGORIAN']
  for (const b of week?.blocks ?? []) {
    if (b.inicio === 'flex' || b.fin === 'flex') continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:wtw-${b.id}@wtw-app`,
      `DTSTART:${dt(b.fecha, b.inicio)}`,
      `DTEND:${dt(b.fecha, b.fin)}`,
      `SUMMARY:${esc(b.titulo)}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="wtw-${isoWeekOf(new Date())}.ics"`,
    },
  })
}
