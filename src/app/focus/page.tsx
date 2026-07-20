import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { todayStr } from '@/lib/dates'
import { getDayBlocks } from '@/app/(app)/dia/service'
import { FocusView } from './FocusView'

export default async function FocusPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const blocks = await getDayBlocks(session.userId, todayStr())

  return <FocusView blocks={blocks} />
}
