import type { StatusContext } from '@/lib/ai/status-context'

// Plantilla versionada del prompt de status de equipo — ver
// docs/plans/2026-07-16-fase7-pmo-ia-design.md §5. Cambios de contenido que
// alteren el comportamiento del modelo deben venir acompañados de un bump de
// PROMPT_VERSION (atribución de regresiones vía Artifact.promptVersion).
export const PROMPT_VERSION = 'v1'

export type BuildStatusEquipoPromptParams = {
  nombreUsuario: string
  perfilVoz: unknown // AiProfile.contenido — JSON visible y editable por el usuario
  fewshots: string[] // 0-2 status reales previos (Artifact.final), más reciente primero
  insumos: StatusContext
}

export type PromptMessage = { role: 'user' | 'assistant'; content: string }

export type BuiltPrompt = {
  system: string
  messages: PromptMessage[]
}

function seccionFewshots(fewshots: string[]): string {
  if (fewshots.length === 0) {
    return 'EJEMPLOS PREVIOS: no hay status previos disponibles — apóyate únicamente en el perfil de voz.'
  }
  const ejemplos = fewshots
    .map((texto, i) => `--- Ejemplo ${i + 1} (más reciente primero) ---\n${texto}`)
    .join('\n\n')
  return `EJEMPLOS PREVIOS DE STATUS REALES DEL USUARIO (imita el estilo, NO copies los hechos):\n\n${ejemplos}`
}

export function buildStatusEquipoPrompt(params: BuildStatusEquipoPromptParams): BuiltPrompt {
  const { nombreUsuario, perfilVoz, fewshots, insumos } = params

  const system = [
    `Redactas el status interno de proyecto de ${nombreUsuario} para su equipo en Slack, en su voz exacta.`,
    '',
    'PERFIL DE VOZ (estructura, movimientos característicos, tono, qué evitar):',
    JSON.stringify(perfilVoz, null, 2),
    '',
    seccionFewshots(fewshots),
    '',
    'REGLAS DURAS (no negociables):',
    '- PROHIBIDO incluir cualquier hecho, nombre, fecha o número que no esté en los insumos. Lo que no está capturado NO existe.',
    '- Nombres propios permitidos: EXCLUSIVAMENTE los de esta whitelist — ningún otro nombre propio puede aparecer en el texto:',
    `  ${JSON.stringify(insumos.whitelist)}`,
    '- Si una sección no tiene insumos (p. ej. facturación sin novedades), se omite por completo — no se rellena ni se inventa contenido de relleno.',
    '- Español mexicano de negocio.',
    '- Salida en texto plano estilo Slack: negritas con asteriscos (*así*), SIN encabezados markdown (nada de #, ##, etc.).',
  ].join('\n')

  const messages: PromptMessage[] = [
    {
      role: 'user',
      content: `INSUMOS (única fuente de hechos permitida — todo lo que no esté aquí no existe):\n\n${JSON.stringify(insumos, null, 2)}`,
    },
  ]

  return { system, messages }
}
