import { vi } from 'vitest'
import type { CallModelResult } from '@/lib/ai/client'

// Helper para mockear src/lib/ai/client.ts en tests de servicios que llaman
// callModel() (p. ej. generate-status.ts). La suite normal NUNCA debe llamar
// al SDK real — solo los evals (tests/ai/*, bajo demanda con EVAL=1).
//
// Patrón de uso en el archivo de test (el vi.mock debe ir en top-level, no
// dentro de un helper, por el hoisting de vitest):
//
//   import { vi } from 'vitest'
//   import { mockCallModelResponse } from './helpers/mock-ai'
//
//   vi.mock('@/lib/ai/client', () => ({ callModel: vi.fn() }))
//
//   import { callModel } from '@/lib/ai/client'
//
//   beforeEach(() => {
//     vi.mocked(callModel).mockResolvedValue(mockCallModelResponse('texto del borrador'))
//   })

export function mockCallModelResponse(
  text: string,
  usage: CallModelResult['usage'] = { inputTokens: 100, outputTokens: 50 }
): CallModelResult {
  return { text, usage }
}
