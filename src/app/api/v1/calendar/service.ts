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

  const withId = events.map((e) => ({
    externalId: `${e.start.toISOString().slice(0, 10)}|${hhmm(e.start)}|${e.summary}`,
    fecha: new Date(e.start.toISOString().slice(0, 10)),
    inicio: hhmm(e.start),
    fin: hhmm(e.end),
    titulo: e.summary,
  }))

  // Diff en vez de borrar-y-recrear: el externalId ya es determinista
  // (fecha|hora|título), así que un evento que sigue vivo en el feed
  // conserva su mismo id entre syncs. Borrar-y-recrear a ciegas perdía las
  // marcas manuales de Mau (cancelado/bloqueante) en cada "Actualizar
  // juntas" — un evento que él marcó "no me bloquea" volvía a bloquear.
  const existentes = await prisma.calendarEvent.findMany({
    where: { userId, fecha: { gte: cutoff, lte: horizon } },
    select: { id: true, externalId: true },
  })
  const idsFeedActual = new Set(withId.map((e) => e.externalId))
  const idsExistentes = new Set(existentes.map((e) => e.externalId))

  const aBorrar = existentes.filter((e) => !idsFeedActual.has(e.externalId)).map((e) => e.id)
  const aInsertar = withId.filter((e) => !idsExistentes.has(e.externalId))

  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({ where: { id: { in: aBorrar } } }),
    prisma.calendarEvent.createMany({
      data: aInsertar.map((e) => ({ userId, ...e })),
      skipDuplicates: true, // UIDs repetidos de recurrentes (RECURRENCE-ID)
    }),
  ])

  return { synced: events.length }
}
