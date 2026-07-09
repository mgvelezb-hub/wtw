import { prisma } from '@/lib/prisma'
import { parseIcs } from '@/lib/ics'
import { isoWeekOf, weekRange } from '@/lib/dates'

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export async function syncCalendar(userId: string): Promise<{ synced: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.icsUrl) throw new Error('icsUrl no configurada')

  const res = await fetch(user.icsUrl)
  if (!res.ok) throw new Error(`ICS fetch falló: ${res.status}`)

  // Ventana: del lunes de esta semana a +8 semanas. Se expande la recurrencia
  // (RRULE) dentro de este rango — las juntas semanales (SCRUM, internas) tienen
  // su VEVENT anclado en el pasado y sin expansión no aparecerían nunca.
  const cutoff = weekRange(isoWeekOf(new Date())).inicio
  const horizon = new Date(cutoff.getTime() + 8 * 7 * 86400000)

  const events = parseIcs(await res.text(), { start: cutoff, end: horizon }).filter(
    (e) =>
      !e.allDay && // los de día completo (OOO, cumpleaños) no ocupan un horario
      !e.summary.startsWith('Cancelado:') && // eventos cancelados no consumen tiempo
      // Si Mau importó a su Outlook el .ics que esta misma app exporta (para ver
      // su plan del día ahí), esos eventos vuelven en su feed real con el UID
      // que les pusimos nosotros (wtw-<blockId>@wtw-app). Sin este filtro, el
      // siguiente sync/reflow los leería como "juntas reales" — un bloque
      // empujándose a sí mismo, o contando doble contra su propio horario.
      !e.uid.endsWith('@wtw-app')
  )

  // Espejo de solo-lectura: reemplazar la ventana completa en 2 queries en vez
  // de N upserts secuenciales (cada roundtrip a Neon ~1-2s → minutos con 400).
  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({ where: { userId } }),
    prisma.calendarEvent.createMany({
      data: events.map((e) => ({
        userId,
        // externalId compuesto: instancias de una misma serie comparten UID base;
        // fecha+hora+título garantiza unicidad e idempotencia entre syncs.
        externalId: `${e.start.toISOString().slice(0, 10)}|${hhmm(e.start)}|${e.summary}`,
        fecha: new Date(e.start.toISOString().slice(0, 10)),
        inicio: hhmm(e.start),
        fin: hhmm(e.end),
        titulo: e.summary,
      })),
      skipDuplicates: true, // UIDs repetidos de recurrentes (RECURRENCE-ID)
    }),
  ])

  return { synced: events.length }
}
