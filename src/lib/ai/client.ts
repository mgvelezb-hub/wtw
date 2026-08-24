import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

// ÚNICO punto del repo que toca el SDK de Anthropic. Ver
// docs/plans/2026-07-16-fase7-pmo-ia-design.md §3. Todo llamador pasa por
// callModel() — nunca instanciar Anthropic en otro archivo.

// 8000 y no 2000: los modelos actuales razonan por default y esos tokens de
// razonamiento salen del MISMO presupuesto que el texto. Con 2000, una llamada
// de sugerir Wins gastó 1446 en razonar y dejó 554 para el JSON, que llegó
// cortado a media entrada — y el planeador lo reportó como "formato que no pude
// leer", culpando al modelo de un techo nuestro. generate-status.ts ya pedía
// 8000 por esta razón; el default se quedó atrás. No cuesta más: se cobra lo
// generado, no lo presupuestado.
const DEFAULT_MAX_TOKENS = 8000

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
  stopReason: string | null
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number }
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
    const thinkingTokens = response.usage?.output_tokens_details?.thinking_tokens ?? 0

    const stopReason = response.stop_reason ?? null

    await prisma.aiCall.create({
      data: { userId, feature, modelo: model, inputTokens, outputTokens, thinkingTokens, stopReason, ms },
    })

    // Una respuesta truncada NO se devuelve: un JSON a medias falla al parsear y
    // se reporta como error de formato, y una prosa a medias se guarda como
    // borrador bueno. Las dos pistas son falsas. El llamador ya traduce el
    // mensaje de la excepción a su banner, así que aquí basta con decir la
    // verdad — y decir cuánto se fue en razonar, que es lo que suele agotar el
    // presupuesto.
    if (stopReason === 'max_tokens') {
      throw new Error(
        `La respuesta de la IA se cortó al llegar al techo de ${maxTokens} tokens ` +
          `(${thinkingTokens} se fueron en razonamiento). Reintentar la va a cortar igual: ` +
          `sube maxTokens de este feature o acorta el contexto.`
      )
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    return { text, stopReason, usage: { inputTokens, outputTokens, thinkingTokens } }
  } catch (error) {
    const ms = Date.now() - start
    // El truncado ya quedó registrado arriba con sus tokens reales; volver a
    // insertar aquí duplicaría la fila con ceros y ensuciaría las métricas.
    if (error instanceof Error && error.message.startsWith('La respuesta de la IA se cortó')) throw error
    // stopReason null en esta fila significa "la llamada no llegó a devolver
    // nada" — se distingue así de un 'max_tokens', que sí respondió y se cortó.
    await prisma.aiCall.create({
      data: { userId, feature, modelo: model, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, stopReason: null, ms },
    })
    throw error
  }
}
