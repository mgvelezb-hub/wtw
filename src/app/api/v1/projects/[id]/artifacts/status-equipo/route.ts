import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { generateStatusEquipo } from '@/lib/ai/generate-status'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const artifact = await generateStatusEquipo(user.id, id)
    return NextResponse.json({ artifact }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
