import type { TipoTrabajo } from '@prisma/client'

// Etiquetas y orden del enum, en un módulo SIN acceso a datos a propósito:
// `factor-clase.ts` importa `prisma` (que instancia PrismaClient) y por eso no
// puede tocarlo un Client Component. Los labels sí los necesita el formulario de
// captura, así que viven aparte.
export const TIPO_TRABAJO_LABEL: Record<TipoTrabajo, string> = {
  deck: 'Deck',
  analisis: 'Análisis',
  junta: 'Junta',
  gestion: 'Gestión',
  comunicacion: 'Comunicación',
  otro: 'Otro',
}

export const TIPOS_TRABAJO = Object.keys(TIPO_TRABAJO_LABEL) as TipoTrabajo[]

export type FactorClasePlano = { factor: number | null; muestras: number }

// El factor que le toca a UNA tarea: el de su clase si esa clase ya tiene
// muestras suficientes, y si no el global.
//
// Es lo que hace que el factor por clase sirva de algo. Medirlo por clase y
// luego planear con el promedio global es medir bien y corregir mal: un deck que
// históricamente se va al doble se seguía planeando al 1.4 del promedio, y ese
// promedio ya venía diluido por las juntas, que salen casi a tiempo.
export function factorDeClase(
  tipo: TipoTrabajo | null | undefined,
  factores: Partial<Record<TipoTrabajo, FactorClasePlano>> | null | undefined,
  factorGlobal: number
): number {
  if (!tipo || !factores) return factorGlobal
  return factores[tipo]?.factor ?? factorGlobal
}
