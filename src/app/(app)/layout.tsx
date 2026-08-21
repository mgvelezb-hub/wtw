import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hrefsArchivados } from '@/lib/flags'
import { AppShell } from './AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { nombre: true } })
  // Proyectos activos del usuario, para los sub-links del sidebar bajo
  // "Proyectos" (objeto plano — nunca el modelo de Prisma completo, regla 2).
  const proyectos = await prisma.project.findMany({
    where: { userId: session.userId, estatus: 'activo' },
    select: { id: true, nombre: true, color: true },
    orderBy: { nombre: 'asc' },
  })
  return (
    <AppShell nombre={user?.nombre ?? ''} archivados={hrefsArchivados()} proyectos={proyectos}>
      {children}
    </AppShell>
  )
}
