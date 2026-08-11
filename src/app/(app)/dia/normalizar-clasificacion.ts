import type { MinutaItemTipo } from '@prisma/client'

// Normalización de lo que devuelve la IA al clasificar una minuta. Vive fuera de
// minuta-ai-actions.ts porque un archivo 'use server' solo puede exportar
// funciones async — y porque así se puede probar sin sesión.

const TIPOS_VALIDOS: MinutaItemTipo[] = [
  'acuerdo',
  'decision',
  'pendiente_nuestro',
  'pendiente_cliente',
  'solicitud_data',
  'actividad_nueva',
  'riesgo',
  'nota',
]

export type ItemPropuesto = {
  tipo: MinutaItemTipo
  texto: string
  responsable?: string
  fechaCompromiso?: string
}

// Toda la defensa está aquí: el modelo puede inventar un tipo, mandar una fecha
// en otro formato o devolver items vacíos. Nada de eso debe tirar la
// clasificación completa — perder un campo es mejor que perder la junta.
export function normalizarItems(crudo: unknown): ItemPropuesto[] {
  if (!Array.isArray(crudo)) return []

  return crudo
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .filter((i) => typeof i.texto === 'string' && i.texto.trim() !== '')
    .map((i) => ({
      // Un tipo inventado cae a 'nota': perder la clasificación de un item es
      // mejor que perder el item.
      tipo: TIPOS_VALIDOS.includes(i.tipo as MinutaItemTipo) ? (i.tipo as MinutaItemTipo) : ('nota' as MinutaItemTipo),
      texto: (i.texto as string).trim(),
      responsable:
        typeof i.responsable === 'string' && i.responsable.trim() !== '' ? i.responsable.trim() : undefined,
      // Solo se acepta YYYY-MM-DD. Una fecha en otro formato se descarta en vez
      // de guardarse mal: un compromiso con fecha equivocada es peor que uno sin fecha.
      fechaCompromiso:
        typeof i.fechaCompromiso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.fechaCompromiso)
          ? i.fechaCompromiso
          : undefined,
    }))
}
