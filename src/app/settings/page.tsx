import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage() {
  const session = await verifySession()
  if (!session) return null

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })

  return (
    <main className="min-h-dvh bg-neutral-50">
      <SettingsForm
        user={{
          horarioInicio: user.horarioInicio,
          horarioFin: user.horarioFin,
          comidaInicio: user.comidaInicio,
          comidaFin: user.comidaFin,
          bufferPct: user.bufferPct,
          factorManual: user.factorManual ? Number(user.factorManual) : null,
          icsUrl: user.icsUrl,
        }}
      />
    </main>
  )
}
