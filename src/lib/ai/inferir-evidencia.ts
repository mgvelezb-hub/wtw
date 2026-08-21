import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'
import {
  buildInferirEvidenciaPrompt,
  INFERIR_EVIDENCIA_VERSION,
  type InferenciaContexto,
  type ReactivoCandidato,
} from '@/lib/ai/prompts/inferir-evidencia'
import { normalizarSugerencias, type SugerenciaEvidencia } from '@/lib/ai/normalizar-evidencia'

// Evidencia inferida desde minutas (patrón Gloat: inferir competencias desde
// artefactos de trabajo real en vez de pedirle al usuario que las declare).
//
// Cierra el loop PMO→desarrollo: la minuta ya existe porque Mau la capturó para
// el proyecto; la rúbrica de VP existe porque decide su promoción; hasta ahora
// nada las conectaba, y llenar la rúbrica a mano es exactamente el trabajo que
// nadie hace. Aquí la IA propone y Mau confirma con un tap — NUNCA se registra
// solo (ver §"la IA propone, no guarda" del diseño de Fase 7).
//
// Ensamblado determinista en el servidor (SQL puro, sin LLM) → prompt → modelo →
// normalización defensiva. Mismo pipeline que generate-status.ts.

// Roles VP que una JUNTA puede demostrar. Los otros siete se quedan fuera a
// propósito: "La perfección en cada detalle" se demuestra en un entregable,
// "Quien cuida al equipo" en el día a día interno, "Todo en orden por el bien de
// la casa" en cómo se archivan los documentos. Ofrecerle al modelo reactivos que
// una minuta no puede probar solo invita a que los fuerce.
const ROLES_EN_JUNTA = ['Quien presenta', 'La mano del Rey', 'La estrategia que renovará al Estado']

const BLOQUE_OBJETIVO = 'objetivo'

export type SugerenciaEvidenciaView = SugerenciaEvidencia & {
  // El texto del reactivo viaja con la sugerencia: la UI tiene que mostrar
  // CONTRA QUÉ se está acreditando el episodio, o el tap deja de ser informado.
  competenciaTexto: string
  competenciaBloque: string
}

export type InferenciaResultado = {
  sugerencias: SugerenciaEvidenciaView[]
  // Cuántos reactivos se le ofrecieron al modelo. Si es 0, no es que la junta no
  // sirviera: es que el usuario no tiene nivel objetivo configurado.
  candidatosEvaluados: number
  promptVersion: string
}

type MinutaConContexto = NonNullable<Awaited<ReturnType<typeof getMinuta>>>

async function getMinuta(userId: string, minutaId: string) {
  return prisma.minuta.findFirst({
    where: { id: minutaId, userId },
    select: {
      id: true,
      fecha: true,
      titulo: true,
      asistentes: true,
      notas: true,
      projectId: true,
      project: { select: { nombre: true, cliente: true } },
      items: {
        orderBy: { orden: 'asc' },
        select: { tipo: true, texto: true, responsable: true },
      },
    },
  })
}

// Catálogo de candidatos: los reactivos del nivel OBJETIVO (los que de verdad
// deciden la promoción — mismo criterio que getDesarrollo y
// competenciasParaPlaneacion) más los roles VP demostrables en junta. Los
// reactivos de OTROS niveles quedan fuera: medirían contra un puesto que no se
// persigue.
async function getCandidatos(userId: string): Promise<ReactivoCandidato[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { nivelObjetivo: { select: { nombre: true } } },
  })

  const objetivo = user.nivelObjetivo?.nombre ?? null

  const competencias = await prisma.competency.findMany({
    where: {
      OR: [
        ...(objetivo ? [{ tipo: 'nivel' as const, grupo: objetivo }] : []),
        { tipo: 'rol' as const, grupo: { in: ROLES_EN_JUNTA } },
      ],
    },
    include: { evidences: { where: { userId }, select: { id: true } } },
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })

  return competencias.map((c) => ({
    id: c.id,
    bloque: c.tipo === 'nivel' ? `${BLOQUE_OBJETIVO} · ${c.grupo ?? ''} · reactivo ${c.orden}` : (c.grupo ?? BLOQUE_OBJETIVO),
    texto: c.texto,
    vacio: c.evidences.length === 0,
  }))
}

function buildContexto(
  nombreUsuario: string,
  minuta: MinutaConContexto,
  candidatos: ReactivoCandidato[]
): InferenciaContexto {
  return {
    nombreUsuario,
    proyecto: minuta.project.nombre,
    cliente: minuta.project.cliente,
    fecha: minuta.fecha.toISOString().slice(0, 10),
    titulo: minuta.titulo,
    asistentes: minuta.asistentes,
    notas: minuta.notas,
    items: minuta.items.map((i) => ({ tipo: i.tipo, texto: i.texto, responsable: i.responsable })),
    candidatos,
  }
}

// Lanza si la minuta no es del usuario o si falta ANTHROPIC_API_KEY (vía
// callModel) — el llamador la traduce a un banner legible, igual que
// generarStatusAction.
export async function inferirEvidencia(userId: string, minutaId: string): Promise<InferenciaResultado> {
  const [user, minuta, candidatos] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nombre: true } }),
    getMinuta(userId, minutaId),
    getCandidatos(userId),
  ])

  if (!minuta) throw new Error('minuta no encontrada')

  // Una minuta sin nada capturado no tiene episodios que leer: llamar al modelo
  // solo gastaría tokens para que responda [].
  const hayContenido = minuta.items.length > 0 || (minuta.notas ?? '').trim() !== ''
  if (!hayContenido || candidatos.length === 0) {
    return { sugerencias: [], candidatosEvaluados: candidatos.length, promptVersion: INFERIR_EVIDENCIA_VERSION }
  }

  const { system, messages } = buildInferirEvidenciaPrompt(buildContexto(user.nombre, minuta, candidatos))

  // GENERATE y no CLASSIFY: esto no es extracción mecánica de campos, es un
  // juicio sobre si una conducta quedó demostrada. La precisión importa más que
  // el costo — el volumen es de una llamada por junta, y cada falso positivo
  // entra a la rúbrica de promoción con un solo tap.
  const { text } = await callModel({
    userId,
    feature: 'inferir_evidencia',
    model: GENERATE,
    system,
    messages,
    maxTokens: 2000,
  })

  const porId = new Map(candidatos.map((c) => [c.id, c]))
  const sugerencias = normalizarSugerencias(extraerJSON<unknown>(text), porId.keys())

  return {
    sugerencias: sugerencias.map((s) => {
      const candidato = porId.get(s.competencyId)!
      return { ...s, competenciaTexto: candidato.texto, competenciaBloque: candidato.bloque }
    }),
    candidatosEvaluados: candidatos.length,
    promptVersion: INFERIR_EVIDENCIA_VERSION,
  }
}
