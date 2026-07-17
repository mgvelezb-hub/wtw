import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { promoteItem } from '@/app/api/v1/minutas/service'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const item = await promoteItem(user.id, id)
    return NextResponse.json({ item })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
