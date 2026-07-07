import { prisma } from '@/lib/prisma'
import { parseIcs } from '@/lib/ics'

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export async function syncCalendar(userId: string): Promise<{ synced: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.icsUrl) throw new Error('icsUrl no configurada')

  const res = await fetch(user.icsUrl)
  if (!res.ok) throw new Error(`ICS fetch falló: ${res.status}`)
  const events = parseIcs(await res.text()).filter((e) => !e.allDay)

  for (const e of events) {
    const fecha = new Date(e.start.toISOString().slice(0, 10))
    await prisma.calendarEvent.upsert({
      where: { userId_externalId: { userId, externalId: e.uid } },
      create: { userId, externalId: e.uid, fecha, inicio: hhmm(e.start), fin: hhmm(e.end), titulo: e.summary },
      update: { fecha, inicio: hhmm(e.start), fin: hhmm(e.end), titulo: e.summary },
    })
  }
  return { synced: events.length }
}
