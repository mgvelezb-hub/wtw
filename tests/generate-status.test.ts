import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/ai/client', () => ({ callModel: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { PROMPT_VERSION } from '@/lib/ai/prompts/status-equipo'
import { GENERATE } from '@/lib/ai/models'
import { generateStatusEquipo, updateArtifact } from '@/lib/ai/generate-status'
import { mockCallModelResponse } from './helpers/mock-ai'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-generate-status@vp.mx'
const OTHER_EMAIL = 'test-generate-status-other@vp.mx'
const VOICE_PROFILE_TIPO = 'voice_status_equipo'

beforeEach(async () => {
  vi.mocked(callModel).mockReset()
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTHER_EMAIL)
})

async function seedUserAndProject(email = TEST_EMAIL) {
  const user = await prisma.user.create({
    data: { email, nombre: 'Mau Gonzalez', passwordHash: 'x' },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, nombre: 'Liverpool ET', cliente: 'Liverpool' },
  })
  return { user, project }
}

async function seedVoiceProfile(userId: string) {
  return prisma.aiProfile.create({
    data: {
      userId,
      projectId: null,
      tipo: VOICE_PROFILE_TIPO,
      contenido: { tono: 'Directo, profesional-cercano', evitar: ['relleno'] },
    },
  })
}

describe('generateStatusEquipo', () => {
  it('persiste el Artifact con borrador, insumos, promptVersion y modelo correctos', async () => {
    const { user, project } = await seedUserAndProject()
    await seedVoiceProfile(user.id)
    vi.mocked(callModel).mockResolvedValue(mockCallModelResponse('*Avances*: todo bien.'))

    const artifact = await generateStatusEquipo(user.id, project.id)

    expect(artifact.borrador).toBe('*Avances*: todo bien.')
    expect(artifact.promptVersion).toBe(PROMPT_VERSION)
    expect(artifact.modelo).toBe(GENERATE)
    expect(artifact.tipo).toBe('status_equipo')
    expect(artifact.audiencia).toBe('equipo')
    expect(artifact.estado).toBe('borrador')
    expect(artifact.final).toBeNull()
    expect(artifact.insumos).toMatchObject({ whitelist: expect.any(Array) })

    const persistido = await prisma.artifact.findUnique({ where: { id: artifact.id } })
    expect(persistido?.borrador).toBe('*Avances*: todo bien.')
  })

  it('sin AiProfile: lanza error claro y NO llama a callModel', async () => {
    const { user, project } = await seedUserAndProject()

    await expect(generateStatusEquipo(user.id, project.id)).rejects.toThrow(/AiProfile/)
    expect(callModel).not.toHaveBeenCalled()
  })

  it('el system prompt contiene el perfil de voz y la whitelist; los insumos van en el mensaje', async () => {
    const { user, project } = await seedUserAndProject()
    await seedVoiceProfile(user.id)

    const issue = await prisma.issue.create({
      data: {
        projectId: project.id,
        tipo: 'pendiente',
        descripcion: 'Sigue sin respuesta de Mario',
        responsable: 'Mario Nombre Unico',
        estatus: 'abierto',
      },
    })

    vi.mocked(callModel).mockResolvedValue(mockCallModelResponse('borrador'))

    await generateStatusEquipo(user.id, project.id)

    expect(callModel).toHaveBeenCalledTimes(1)
    const args = vi.mocked(callModel).mock.calls[0][0]

    expect(args.system).toContain('Directo, profesional-cercano')
    expect(args.system).toContain('Mario Nombre Unico')

    const insumosMensaje = args.messages.find((m) => m.content.includes('INSUMOS'))
    expect(insumosMensaje).toBeDefined()
    expect(insumosMensaje?.content).toContain(issue.descripcion)
    expect(insumosMensaje?.content).toContain('Mario Nombre Unico')
  })

  it('few-shots: con 2 status previos enviados, entran al prompt en orden más-reciente-primero', async () => {
    const { user, project } = await seedUserAndProject()
    await seedVoiceProfile(user.id)

    const viejo = await prisma.artifact.create({
      data: {
        userId: user.id,
        projectId: project.id,
        tipo: 'status_equipo',
        insumos: {},
        borrador: 'borrador viejo',
        final: 'STATUS-VIEJO-TEXTO-UNICO',
        estado: 'enviado',
        modelo: GENERATE,
        promptVersion: 'v1',
      },
    })
    // separar createdAt de forma determinista sin depender de reloj real
    await prisma.artifact.update({
      where: { id: viejo.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    })

    await prisma.artifact.create({
      data: {
        userId: user.id,
        projectId: project.id,
        tipo: 'status_equipo',
        insumos: {},
        borrador: 'borrador nuevo',
        final: 'STATUS-NUEVO-TEXTO-UNICO',
        estado: 'editado',
        modelo: GENERATE,
        promptVersion: 'v1',
      },
    })

    vi.mocked(callModel).mockResolvedValue(mockCallModelResponse('borrador generado'))

    await generateStatusEquipo(user.id, project.id)

    const args = vi.mocked(callModel).mock.calls[0][0]
    const idxNuevo = args.system.indexOf('STATUS-NUEVO-TEXTO-UNICO')
    const idxViejo = args.system.indexOf('STATUS-VIEJO-TEXTO-UNICO')

    expect(idxNuevo).toBeGreaterThanOrEqual(0)
    expect(idxViejo).toBeGreaterThanOrEqual(0)
    // orden elegido: más reciente primero
    expect(idxNuevo).toBeLessThan(idxViejo)
  })
})

describe('updateArtifact', () => {
  async function seedArtifact(userId: string, projectId: string) {
    return prisma.artifact.create({
      data: {
        userId,
        projectId,
        tipo: 'status_equipo',
        insumos: { algo: true },
        borrador: 'borrador original intacto',
        estado: 'borrador',
        modelo: GENERATE,
        promptVersion: PROMPT_VERSION,
      },
    })
  }

  it('PATCH captura final sin tocar borrador', async () => {
    const { user, project } = await seedUserAndProject()
    const artifact = await seedArtifact(user.id, project.id)

    const actualizado = await updateArtifact(user.id, artifact.id, {
      final: 'texto editado por el usuario',
      estado: 'editado',
    })

    expect(actualizado.final).toBe('texto editado por el usuario')
    expect(actualizado.estado).toBe('editado')
    expect(actualizado.borrador).toBe('borrador original intacto')
  })

  it('estado inválido lanza error', async () => {
    const { user, project } = await seedUserAndProject()
    const artifact = await seedArtifact(user.id, project.id)

    await expect(
      updateArtifact(user.id, artifact.id, { estado: 'no-existe' as never })
    ).rejects.toThrow(/estado inválido/)
  })

  it('artifact ajeno lanza error', async () => {
    const { user, project } = await seedUserAndProject()
    const artifact = await seedArtifact(user.id, project.id)
    const { user: otro } = await seedUserAndProject(OTHER_EMAIL)

    await expect(updateArtifact(otro.id, artifact.id, { final: 'intento ajeno' })).rejects.toThrow(
      /no encontrado/
    )
  })
})
