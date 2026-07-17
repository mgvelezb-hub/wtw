import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

// ÚNICO punto del repo que toca el SDK de Anthropic. Ver
// docs/plans/2026-07-16-fase7-pmo-ia-design.md §3. Todo llamador pasa por
// callModel() — nunca instanciar Anthropic en otro archivo.

const DEFAULT_MAX_TOKENS = 2000

export interface CallModelParams {
  userId: string
  feature: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}

export interface CallModelResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  const { userId, feature, model, system, messages, maxTokens = DEFAULT_MAX_TOKENS } = params

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no configurada')
  }

  const client = new Anthropic({ apiKey })
  const start = Date.now()

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    })

    const ms = Date.now() - start
    const inputTokens = response.usage?.input_tokens ?? 0
    const outputTokens = response.usage?.output_tokens ?? 0

    await prisma.aiCall.create({
      data: { userId, feature, modelo: model, inputTokens, outputTokens, ms },
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    return { text, usage: { inputTokens, outputTokens } }
  } catch (error) {
    const ms = Date.now() - start
    await prisma.aiCall.create({
      data: { userId, feature, modelo: model, inputTokens: 0, outputTokens: 0, ms },
    })
    throw error
  }
}
