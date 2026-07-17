import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { getArtifact, updateArtifact } from '@/lib/ai/generate-status'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const artifact = await getArtifact(user.id, id)
    return NextResponse.json({ artifact })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  try {
    const artifact = await updateArtifact(user.id, id, { final: body.final, estado: body.estado })
    return NextResponse.json({ artifact })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
