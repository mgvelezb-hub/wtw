import { verifySession } from '@/lib/auth'
import { listInbox } from './service'
import { InboxBoard } from './InboxBoard'

export default async function InboxPage() {
  const session = await verifySession()
  if (!session) return null

  const tasks = await listInbox(session.userId)

  return (
    <main className="min-h-dvh bg-neutral-50">
      <InboxBoard tasks={tasks} />
    </main>
  )
}
