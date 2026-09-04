import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SettingsForm } from './SettingsForm'
import { RecordatoriosPanel } from './Recordatorios'
import { clavePublica, pushConfigurado, leerRecordatorios } from '@/lib/push'

export default async function SettingsPage() {
  const session = await verifySession()
  if (!session) return null

  const [user, dispositivos] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    prisma.pushSub.count({ where: { userId: session.userId } }),
  ])

  return (
    <main className="min-h-dvh bg-paper">
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
      <div className="mx-auto max-w-md px-4 pb-8">
        <RecordatoriosPanel
          inicial={leerRecordatorios(user.recordatorios)}
          configurado={pushConfigurado()}
          clavePublica={clavePublica()}
          dispositivos={dispositivos}
        />
      </div>
    </main>
  )
}
