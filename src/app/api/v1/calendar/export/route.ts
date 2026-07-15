import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isoWeekOf } from '@/lib/dates'

// Una hora "25:30" (bloque empujado más allá de medianoche por una cascada)
// rueda al día siguiente — T253000 es inválido en iCalendar y Outlook rechaza
// el archivo COMPLETO por un solo valor así.
function dt(fecha: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const totalMin = (h || 0) * 60 + (m || 0)
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + Math.floor(totalMin / 1440))
  const min = totalMin % 1440
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${mo}${dd}T${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`
}

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

// RFC 5545 §3.1: líneas de máximo 75 octetos; se continúan con CRLF + espacio.
// Se parte por caracteres cuidando no exceder 74 bytes por segmento (un char
// UTF-8 puede ocupar hasta 4 bytes — nunca se corta a media secuencia).
function fold(line: string): string[] {
  if (Buffer.byteLength(line, 'utf8') <= 75) return [line]
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  let first = true
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8')
    const limit = first ? 74 : 73 // las continuaciones llevan un espacio inicial
    if (curBytes + chBytes > limit) {
      out.push(first ? cur : ` ${cur}`)
      first = false
      cur = ch
      curBytes = chBytes
    } else {
      cur += ch
      curBytes += chBytes
    }
  }
  if (cur) out.push(first ? cur : ` ${cur}`)
  return out
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

  // DTSTAMP es obligatorio en cada VEVENT (RFC 5545 §3.6.1) — Outlook rechaza
  // el import sin él.
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(
    2,
    '0'
  )}${String(now.getUTCSeconds()).padStart(2, '0')}Z`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WTW App//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:WTW — Mi semana',
  ]
  for (const b of week?.blocks ?? []) {
    if (b.inicio === 'flex' || b.fin === 'flex') continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:wtw-${b.id}@wtw-app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt(b.fecha, b.inicio)}`,
      `DTEND:${dt(b.fecha, b.fin)}`,
      `SUMMARY:${esc(b.titulo)}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.flatMap(fold).join('\r\n'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="wtw-${isoWeekOf(new Date())}.ics"`,
    },
  })
}
