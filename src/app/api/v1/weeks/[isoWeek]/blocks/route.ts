import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { appendBlocks } from '../../service'

export async function POST(req: Request, { params }: { params: Promise<{ isoWeek: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { isoWeek } = await params
  const body = await req.json()
  if (!Array.isArray(body?.tasks) || !Array.isArray(body?.blocks)) {
    return NextResponse.json({ error: 'tasks[] y blocks[] son requeridos' }, { status: 422 })
  }

  try {
    const week = await appendBlocks(user.id, isoWeek, body)
    return NextResponse.json({ week }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
