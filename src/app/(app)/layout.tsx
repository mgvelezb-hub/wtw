import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hrefsArchivados } from '@/lib/flags'
import { AppShell } from './AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { nombre: true } })
  return (
    <AppShell nombre={user?.nombre ?? ''} archivados={hrefsArchivados()}>
      {children}
    </AppShell>
  )
}
