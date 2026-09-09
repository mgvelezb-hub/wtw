import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hrefsArchivados } from '@/lib/flags'
import { AppShell } from './AppShell'
import { TemaCliente } from './tema-cliente'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (!session) redirect('/login')
  // `horarioInicio`/`horarioFin` viajan al cliente para que el tema sepa cuándo
  // termina la jornada sin pedirle nada al servidor cada minuto.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { nombre: true, horarioInicio: true, horarioFin: true },
  })
  // Proyectos activos del usuario, para los sub-links del sidebar bajo
  // "Proyectos" (objeto plano — nunca el modelo de Prisma completo, regla 2).
  const proyectos = await prisma.project.findMany({
    where: { userId: session.userId, estatus: 'activo' },
    select: { id: true, nombre: true, color: true },
    orderBy: { nombre: 'asc' },
  })
  return (
    <>
      <TemaCliente jornada={{ inicioMin: aMinutos(user?.horarioInicio), finMin: aMinutos(user?.horarioFin, 18 * 60) }} />
      <AppShell nombre={user?.nombre ?? ''} archivados={hrefsArchivados()} proyectos={proyectos}>
        {children}
      </AppShell>
    </>
  )
}

// "09:00" a minutos. El default cubre al usuario que nunca abrió Ajustes: sin
// jornada declarada, 09–18 es la que la app ya asume en todos lados.
function aMinutos(hhmm: string | null | undefined, respaldo = 9 * 60): number {
  if (!hhmm) return respaldo
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : respaldo
}
