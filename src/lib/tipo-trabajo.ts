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
