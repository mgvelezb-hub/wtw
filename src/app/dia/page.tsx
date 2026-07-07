import { verifySession } from '@/lib/auth'
import { todayStr } from '@/lib/dates'
import { getDayBlocks } from './service'
import { DiaBoard } from './DiaBoard'

export default async function DiaPage() {
  const session = await verifySession()
  if (!session) return null // el proxy ya redirige antes de llegar aquí

  const blocks = await getDayBlocks(session.userId, todayStr())

  if (blocks.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 text-center">
        <p className="text-sm text-neutral-500">
          No hay bloques para hoy todavía. Corre <code>/wtw-dia</code> o <code>/wtw-semana</code>.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <DiaBoard blocks={blocks} />
    </main>
  )
}
