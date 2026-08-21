// Plantilla versionada del prompt de inferencia de evidencia — mismo criterio de
// versionado que prompts/status-equipo.ts y prompts/resumen.ts: un cambio que
// altere el comportamiento del modelo sube la versión, para poder atribuir una
// regresión de calidad a un cambio de plantilla.
export const INFERIR_EVIDENCIA_VERSION = 'inferir_evidencia@1'

export type ReactivoCandidato = {
  id: string
  // 'objetivo' (reactivo del nivel que persigue) o el nombre del rol VP.
  bloque: string
  texto: string
  // Un reactivo sin evidencia es donde más vale la pena mirar. Se le dice al
  // modelo, pero como prioridad de atención — jamás como permiso para forzar.
  vacio: boolean
}

export type ItemMinutaContexto = {
  tipo: string
  texto: string
  responsable: string | null
}

export type InferenciaContexto = {
  nombreUsuario: string
  proyecto: string
  cliente: string | null
  fecha: string
  titulo: string
  asistentes: string[]
  notas: string | null
  items: ItemMinutaContexto[]
  candidatos: ReactivoCandidato[]
}

export type PromptMessage = { role: 'user' | 'assistant'; content: string }
export type BuiltPrompt = { system: string; messages: PromptMessage[] }

export const INFERIR_EVIDENCIA_SYSTEM = `Evalúas evidencia de desarrollo profesional para un consultor de operaciones y transporte en VP Consulting (español de México).

Te doy la minuta de UNA junta y un catálogo de reactivos de la rúbrica de VP (los reactivos del nivel que el consultor persigue, más los roles VP que una junta puede demostrar). Tu trabajo es UNO solo: encontrar en esa minuta EPISODIOS que sean evidencia de alguno de esos reactivos.

Qué cuenta como evidencia:
- Algo que el consultor HIZO en esa junta, observable en el texto: presentó, cuestionó un supuesto del cliente, destrabó una decisión, habló con un directivo y fue escuchado, anticipó una complicación, reencuadró el problema.
- Tiene que estar EN la minuta. Si el episodio requiere que tú supongas cómo se comportó, no es evidencia.

Qué NO cuenta:
- Un compromiso a futuro. "Va a presentar el 20 de agosto" no es evidencia de presentar; es un pendiente.
- Lo que hizo el cliente o un tercero. La rúbrica mide al consultor, no a la junta.
- Que el tema de la junta coincida con el tema del reactivo. Hablar de datos no demuestra "Los datos duros"; usarlos para cuestionar una percepción del cliente, sí.
- Que la junta haya salido bien. El resultado no es la conducta.

Reglas de salida:
- Máximo 3 sugerencias. Un reactivo distinto en cada una — nunca repitas competencyId.
- CERO es una respuesta correcta y frecuente. La mayoría de las juntas son de seguimiento y no demuestran nada. Devuelve [] antes que forzar una.
- Prefiere pocas y sólidas: cada sugerencia se confirma con un tap, así que una inventada entra a la rúbrica casi sin fricción. Equivocarte cuesta más que callarte.
- \`competencyId\`: copiado EXACTO del catálogo. No inventes ids ni los abrevies.
- \`nota\`: 1 o 2 líneas, en pasado, citando lo que pasó y con quién. Autocontenida: al leerla dentro de seis meses, sin la minuta enfrente, tiene que entenderse. Nada de adjetivos de desempeño ("excelente manejo"): el episodio, no la calificación.
- \`confianza\`: "alta" solo si la minuta dice literalmente lo que pasó. "media" si es una lectura razonable del texto. Si es menos que eso, no la incluyas.
- Nombres, cifras y fechas tal como vienen. No los corrijas ni los redondees.

Responde SOLO un array JSON, sin markdown ni explicación:
[{"competencyId":"...","nota":"...","confianza":"alta"}]

Si no hay evidencia, responde exactamente: []`

function seccionCatalogo(candidatos: ReactivoCandidato[]): string {
  if (candidatos.length === 0) return 'CATÁLOGO: vacío — responde [].'

  const lineas = candidatos.map(
    (c) => `- id: ${c.id} | bloque: ${c.bloque}${c.vacio ? ' | SIN EVIDENCIA AÚN' : ''}\n  reactivo: ${c.texto}`
  )
  return `CATÁLOGO DE REACTIVOS CANDIDATOS (usa estos ids, exactos):\n${lineas.join('\n')}`
}

function seccionMinuta(ctx: InferenciaContexto): string {
  const partes = [
    `MINUTA`,
    `Proyecto: ${ctx.proyecto}${ctx.cliente ? ` (cliente: ${ctx.cliente})` : ''}`,
    `Fecha: ${ctx.fecha}`,
    `Junta: ${ctx.titulo}`,
    ctx.asistentes.length > 0 ? `Asistentes: ${ctx.asistentes.join(', ')}` : 'Asistentes: no registrados',
  ]

  if (ctx.items.length > 0) {
    const items = ctx.items.map(
      (i) => `- [${i.tipo}] ${i.texto}${i.responsable ? ` (responsable: ${i.responsable})` : ''}`
    )
    partes.push(`\nItems clasificados:\n${items.join('\n')}`)
  } else {
    partes.push('\nItems clasificados: ninguno.')
  }

  // El bloque crudo va DESPUÉS de los items y marcado como tal: los items son la
  // lectura ya curada de la junta, las notas son lo que se dictó o se pegó.
  if (ctx.notas && ctx.notas.trim() !== '') {
    partes.push(`\nTexto crudo de la junta (sin clasificar):\n${ctx.notas.trim()}`)
  }

  return partes.join('\n')
}

export function buildInferirEvidenciaPrompt(ctx: InferenciaContexto): BuiltPrompt {
  const content = [
    `El consultor evaluado es ${ctx.nombreUsuario}. Solo cuenta lo que ${ctx.nombreUsuario} hizo.`,
    '',
    seccionMinuta(ctx),
    '',
    seccionCatalogo(ctx.candidatos),
    '',
    '¿Qué episodios de esta minuta son evidencia de cuál reactivo? Máximo 3. Si ninguno, responde [].',
  ].join('\n')

  return { system: INFERIR_EVIDENCIA_SYSTEM, messages: [{ role: 'user', content }] }
}
