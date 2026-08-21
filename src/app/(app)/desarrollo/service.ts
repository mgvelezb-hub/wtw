import { prisma } from '@/lib/prisma'

// Cobertura de competencias. Antes solo contaba evidencias planas; lo que sirve
// para crecer es el hueco contra el nivel OBJETIVO, no el conteo absoluto. Ver
// docs/plans/2026-08-10-alineacion-council.md §Fase 2b.

export type CompetenciaCobertura = {
  id: string
  tipo: string
  grupo: string | null
  // Número del reactivo en el documento de VP — permite decir "el 10 de Gerente".
  orden: number
  texto: string
  evidenciaCount: number
  // Días desde la última evidencia. null = nunca. Es la señal que importa: una
  // competencia con 5 evidencias de hace un año está tan hueca como una vacía.
  diasDesdeUltima: number | null
}

export type CoberturaPorGrupo = {
  grupo: string
  tipo: string
  total: number
  conEvidencia: number
  competencias: CompetenciaCobertura[]
}

export type EslabonEscalafon = {
  nombre: string
  orden: number
  esActual: boolean
  esObjetivo: boolean
}

// ── Patrón vs. anécdota ─────────────────────────────────────────────────────
// El comité no evalúa un episodio: evalúa un PATRÓN multi-proyecto. Un solo
// proyecto no basta por bueno que sea, porque no distingue "sabe hacerlo" de
// "le tocó una vez". De ahí el umbral de 3 piezas y la alerta de concentración:
// 5 evidencias que salen todas de Liverpool siguen siendo una anécdota larga.

export const UMBRAL_PATRON = 3

export type SemaforoPatron = 'sin_evidencia' | 'anecdota' | 'patron'

export type PiezaEvidencia = {
  id: string
  nota: string
  testigo: string | null
  nivelDemostrado: string | null
  proyecto: string | null
  diasDesde: number
}

export type ReactivoPatron = {
  id: string
  orden: number
  texto: string
  evidenciaCount: number
  semaforo: SemaforoPatron
  // Amplitud: de cuántos frentes distintos viene el respaldo. Es lo que separa
  // el patrón de la anécdota repetida.
  proyectos: string[]
  testigos: string[]
  alertas: string[]
  piezas: PiezaEvidencia[]
}

export type PatronNivel = {
  nombre: string
  total: number
  conPatron: number
  // Una línea honesta, sin maquillaje: "0 de 4 reactivos con patrón".
  veredicto: string
  reactivos: ReactivoPatron[]
  siguientePaso: string | null
}

export type DesarrolloView = {
  nivelActual: string | null
  nivelObjetivo: string | null
  expectativasObjetivo: string | null
  // El camino completo, no solo actual→objetivo. Faltaban Trainee, Consultor,
  // Director y Socio: el escalafón arrancaba en Analista y se cortaba en Gerente Sr.
  escalafon: EslabonEscalafon[]
  // Los reactivos del nivel OBJETIVO, del instrumento de VP (sección 2). Es la
  // medición que de verdad decide la promoción, y es distinta de los 48 reactivos
  // de conducta y rol: son 3-4 por nivel, numerados, y se evalúan en escala de 4.
  objetivo: { nombre: string; reactivos: CompetenciaCobertura[] } | null
  // "¿Ya opero como Gerente?" — el mismo conjunto de reactivos leído como lo lee
  // el comité: no cuántas evidencias hay, sino si forman patrón y de cuántos
  // frentes vienen. null cuando no hay nivel objetivo o el documento de VP no
  // publica sus reactivos.
  patron: PatronNivel | null
  grupos: CoberturaPorGrupo[]
  totalReactivos: number
  totalConEvidencia: number
  // Reactivos sin ninguna evidencia, que es la lista de trabajo real.
  huecos: CompetenciaCobertura[]
}

const GRUPO_INDIVIDUAL = 'Conductas individuales'

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000)
}

function unicos(valores: Array<string | null>): string[] {
  return [...new Set(valores.filter((v): v is string => v !== null && v.trim() !== ''))]
}

function semaforoDe(count: number): SemaforoPatron {
  if (count === 0) return 'sin_evidencia'
  return count >= UMBRAL_PATRON ? 'patron' : 'anecdota'
}

// La concentración solo es diagnosticable con 2+ piezas: con una sola no hay
// nada que estar concentrado todavía, y marcarla sería ruido.
const MINIMO_PARA_CONCENTRACION = 2

function alertasDe(orden: number, piezas: PiezaEvidencia[], proyectos: string[], testigos: string[]): string[] {
  if (piezas.length < MINIMO_PARA_CONCENTRACION) return []

  const alertas: string[] = []
  if (proyectos.length === 1) {
    alertas.push(
      `Toda tu evidencia del reactivo ${orden} viene de ${proyectos[0]} — el comité pide patrón, no un solo proyecto.`
    )
  } else if (proyectos.length === 0) {
    alertas.push(
      `Ninguna de las ${piezas.length} piezas del reactivo ${orden} está ligada a un proyecto — sin proyecto no puedes demostrar amplitud.`
    )
  }
  if (testigos.length === 1) {
    alertas.push(`Solo ${testigos[0]} puede corroborar el reactivo ${orden} — un testigo único no es patrón.`)
  } else if (testigos.length === 0) {
    alertas.push(`Nadie está anotado como testigo del reactivo ${orden} — sin quién lo corrobore es tu palabra sola.`)
  }
  return alertas
}

// El reactivo más hueco primero: menos piezas, y a igualdad de piezas el que
// menos frentes tiene. Devuelve UNA acción, no una lista: la lista se ignora.
function siguientePasoDe(reactivos: ReactivoPatron[]): string | null {
  if (reactivos.length === 0) return null

  const [peor] = [...reactivos].sort(
    (a, b) =>
      a.evidenciaCount - b.evidenciaCount ||
      a.proyectos.length - b.proyectos.length ||
      a.testigos.length - b.testigos.length ||
      a.orden - b.orden
  )

  if (peor.evidenciaCount === 0) {
    return `Empieza por el reactivo ${peor.orden}: no tiene una sola pieza. Registra el episodio más reciente en que lo hiciste y anota quién puede corroborarlo.`
  }

  const concentrado = peor.proyectos.length === 1 ? peor.proyectos[0] : null

  if (peor.semaforo === 'anecdota') {
    const faltan = UMBRAL_PATRON - peor.evidenciaCount
    const base = `Al reactivo ${peor.orden} le ${faltan === 1 ? 'falta 1 pieza' : `faltan ${faltan} piezas`} para ser patrón`
    return concentrado
      ? `${base}, y las que tiene vienen de ${concentrado}: la siguiente tiene que salir de otro proyecto.`
      : `${base}.`
  }

  if (concentrado) {
    return `El reactivo ${peor.orden} ya tiene ${peor.evidenciaCount} piezas, pero todas de ${concentrado}. Consigue una de otro proyecto antes de llevarlo al comité.`
  }

  return null
}

export async function getDesarrollo(userId: string, hoy: Date = new Date()): Promise<DesarrolloView> {
  const [user, competencias, niveles] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        nivelActual: { select: { nombre: true } },
        nivelObjetivo: { select: { nombre: true, expectativas: true } },
      },
    }),
    prisma.competency.findMany({
      include: {
        evidences: {
          where: { userId },
          // La amplitud se lee por Evidence→Task/Deliverable→Project: es el único
          // camino que existe de una pieza a un proyecto.
          select: {
            id: true,
            nota: true,
            testigo: true,
            nivelDemostrado: true,
            createdAt: true,
            task: { select: { project: { select: { nombre: true } } } },
            deliverable: { select: { project: { select: { nombre: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
    }),
    prisma.level.findMany({ orderBy: { orden: 'asc' }, select: { nombre: true, orden: true } }),
  ])

  const mapeadas: CompetenciaCobertura[] = competencias.map((c) => {
    const ultima = c.evidences.reduce<Date | null>((max, e) => (max === null || e.createdAt > max ? e.createdAt : max), null)
    return {
      id: c.id,
      tipo: c.tipo,
      grupo: c.grupo,
      orden: c.orden,
      texto: c.texto,
      evidenciaCount: c.evidences.length,
      diasDesdeUltima: ultima ? dias(ultima, hoy) : null,
    }
  })

  // Los reactivos de nivel NO entran en los grupos generales: son otro
  // instrumento y mezclarlos diluiría ambas mediciones.
  const deNivel = mapeadas.filter((c) => c.tipo === 'nivel')
  const generales = mapeadas.filter((c) => c.tipo !== 'nivel')

  const porGrupo = new Map<string, CompetenciaCobertura[]>()
  for (const c of generales) {
    const clave = c.grupo ?? GRUPO_INDIVIDUAL
    const lista = porGrupo.get(clave)
    if (lista) lista.push(c)
    else porGrupo.set(clave, [c])
  }

  const grupos: CoberturaPorGrupo[] = [...porGrupo.entries()].map(([grupo, lista]) => ({
    grupo,
    tipo: lista[0].tipo,
    total: lista.length,
    conEvidencia: lista.filter((c) => c.evidenciaCount > 0).length,
    competencias: lista,
  }))

  const objetivoNombre = user.nivelObjetivo?.nombre ?? null
  const reactivosObjetivo = objetivoNombre
    ? competencias
        .filter((c) => c.tipo === 'nivel' && c.grupo === objetivoNombre)
        .sort((a, b) => a.orden - b.orden)
    : []

  const reactivosPatron: ReactivoPatron[] = reactivosObjetivo.map((c) => {
    const piezas: PiezaEvidencia[] = c.evidences.map((e) => ({
      id: e.id,
      nota: e.nota,
      testigo: e.testigo,
      nivelDemostrado: e.nivelDemostrado,
      proyecto: e.task?.project?.nombre ?? e.deliverable?.project?.nombre ?? null,
      diasDesde: dias(e.createdAt, hoy),
    }))
    const proyectos = unicos(piezas.map((p) => p.proyecto))
    const testigos = unicos(piezas.map((p) => p.testigo))

    return {
      id: c.id,
      orden: c.orden,
      texto: c.texto,
      evidenciaCount: piezas.length,
      semaforo: semaforoDe(piezas.length),
      proyectos,
      testigos,
      alertas: alertasDe(c.orden, piezas, proyectos, testigos),
      piezas,
    }
  })

  const conPatron = reactivosPatron.filter((r) => r.semaforo === 'patron').length

  return {
    nivelActual: user.nivelActual?.nombre ?? null,
    nivelObjetivo: user.nivelObjetivo?.nombre ?? null,
    expectativasObjetivo: user.nivelObjetivo?.expectativas ?? null,
    escalafon: niveles.map((n) => ({
      nombre: n.nombre,
      orden: n.orden,
      esActual: n.nombre === user.nivelActual?.nombre,
      esObjetivo: n.nombre === user.nivelObjetivo?.nombre,
    })),
    objetivo: objetivoNombre
      ? {
          nombre: objetivoNombre,
          reactivos: deNivel.filter((c) => c.grupo === objetivoNombre).sort((a, b) => a.orden - b.orden),
        }
      : null,
    patron:
      objetivoNombre !== null && reactivosPatron.length > 0
        ? {
            nombre: objetivoNombre,
            total: reactivosPatron.length,
            conPatron,
            veredicto: `Evidencia de nivel ${objetivoNombre}: ${conPatron} de ${reactivosPatron.length} reactivos con patrón`,
            reactivos: reactivosPatron,
            siguientePaso: siguientePasoDe(reactivosPatron),
          }
        : null,
    grupos,
    totalReactivos: generales.length,
    totalConEvidencia: generales.filter((c) => c.evidenciaCount > 0).length,
    huecos: generales.filter((c) => c.evidenciaCount === 0),
  }
}

// Vista plana de cobertura. La usa /equipo/[reportId] para ver la cobertura de un
// reporte, donde no aplica el contraste contra nivel objetivo propio.
export async function getCoberturaCompetencias(userId: string): Promise<
  Array<{ id: string; tipo: string; grupo: string | null; texto: string; evidenciaCount: number }>
> {
  const view = await getDesarrollo(userId)
  return view.grupos.flatMap((g) =>
    g.competencias.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      grupo: c.grupo,
      texto: c.texto,
      evidenciaCount: c.evidenciaCount,
    }))
  )
}

// Competencias para el selector de evidencia. Se ordenan poniendo primero los
// huecos: si vas a registrar una evidencia, lo más valioso es que llene un
// reactivo vacío en vez de engordar uno que ya tiene cinco.
export type CompetenciaOpcion = { id: string; etiqueta: string; vacia: boolean }

export async function competenciasParaEvidencia(userId: string): Promise<CompetenciaOpcion[]> {
  const competencias = await prisma.competency.findMany({
    include: { evidences: { where: { userId }, select: { id: true } } },
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })

  return competencias
    .map((c) => ({
      id: c.id,
      etiqueta: `${c.grupo ?? GRUPO_INDIVIDUAL} · ${c.texto.slice(0, 90)}${c.texto.length > 90 ? '…' : ''}`,
      vacia: c.evidences.length === 0,
    }))
    .sort((a, b) => (a.vacia === b.vacia ? 0 : a.vacia ? -1 : 1))
}

// Competencias para etiquetar al PLANEAR (paso 3 del ritual). Se ordenan distinto
// que las de evidencia: primero los reactivos del nivel OBJETIVO, porque son los
// que deciden la promoción, y dentro de cada bloque los huecos primero. Elegir
// aquí —y no al cerrar la tarea— es la única forma de que la semana se planee
// contra el desarrollo en vez de justificarlo después.
export type CompetenciaPlaneacion = {
  id: string
  etiqueta: string
  grupo: string
  esObjetivo: boolean
  vacia: boolean
}

export async function competenciasParaPlaneacion(userId: string): Promise<CompetenciaPlaneacion[]> {
  const [user, competencias] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nivelObjetivo: { select: { nombre: true } } },
    }),
    prisma.competency.findMany({
      include: { evidences: { where: { userId }, select: { id: true } } },
      orderBy: [{ grupo: 'asc' }, { orden: 'asc' }],
    }),
  ])

  const objetivo = user.nivelObjetivo?.nombre ?? null

  return competencias
    // Los reactivos de OTROS niveles no sirven para planear: medirían contra un
    // puesto que no es el que se persigue. Las conductas y roles VP sí entran.
    .filter((c) => c.tipo !== 'nivel' || c.grupo === objetivo)
    .map((c) => {
      const esObjetivo = c.tipo === 'nivel'
      return {
        id: c.id,
        etiqueta: `${esObjetivo ? `${c.orden}. ` : ''}${c.texto.slice(0, 80)}${c.texto.length > 80 ? '…' : ''}`,
        // Los reactivos de nivel se agrupan bajo el nombre del nivel objetivo para
        // que el <optgroup> diga "Objetivo · Gerente" y no "nivel".
        grupo: esObjetivo ? `Objetivo · ${objetivo}` : (c.grupo ?? GRUPO_INDIVIDUAL),
        esObjetivo,
        vacia: c.evidences.length === 0,
      }
    })
    .sort((a, b) => {
      if (a.esObjetivo !== b.esObjetivo) return a.esObjetivo ? -1 : 1
      if (a.vacia !== b.vacia) return a.vacia ? -1 : 1
      return a.grupo.localeCompare(b.grupo)
    })
}

// Bitácora de delegación: el acumulado de trabajo que Mau hizo y no debió hacer.
// Se reporta en horas reales, no en conteo de tareas — "23 h de trabajo de
// analista en 6 semanas" es un argumento; "9 tareas" no lo es.
export type BitacoraDelegacion = {
  tareas: Array<{ id: string; titulo: string; nota: string | null; minutosReales: number; proyecto: string | null }>
  minutosTotales: number
  desde: Date | null
}

export async function getBitacoraDelegacion(userId: string): Promise<BitacoraDelegacion> {
  const tareas = await prisma.task.findMany({
    where: { userId, delegable: true },
    include: {
      project: { select: { nombre: true } },
      timeEntries: { select: { seconds: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const mapeadas = tareas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    nota: t.delegableNota,
    minutosReales: Math.round(t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60),
    proyecto: t.project?.nombre ?? null,
  }))

  return {
    tareas: mapeadas,
    minutosTotales: mapeadas.reduce((s, t) => s + t.minutosReales, 0),
    desde: tareas.length > 0 ? tareas[tareas.length - 1].createdAt : null,
  }
}

// Cierre del ciclo del pre-mortem: riesgos que se predijeron y qué pasó con ellos.
// Es evidencia fechada de capacidad predictiva — lo que pide "Quien tiene
// expertise técnico" ("puede prever complicaciones inherentes al proyecto").
export type HistorialRiesgos = {
  total: number
  cerrados: number
  acertados: number // se predijo y ocurrió
  defensasEfectivas: number // ocurrió y la defensa sirvió
  abiertos: Array<{ id: string; riesgo: string; defensa: string; isoWeek: string }>
  // Los ya cerrados, para poder corregir un cierre equivocado.
  cerradosDetalle: Array<{
    id: string
    riesgo: string
    isoWeek: string
    ocurrio: boolean
    defensaFunciono: boolean | null
  }>
}

export async function getHistorialRiesgos(userId: string): Promise<HistorialRiesgos> {
  const riesgos = await prisma.weekRisk.findMany({
    where: { week: { userId } },
    include: { week: { select: { isoWeek: true, estatus: true } } },
    orderBy: { id: 'asc' },
  })

  const cerrados = riesgos.filter((r) => r.ocurrio !== null)
  const ocurridos = cerrados.filter((r) => r.ocurrio === true)

  return {
    total: riesgos.length,
    cerrados: cerrados.length,
    acertados: ocurridos.length,
    defensasEfectivas: ocurridos.filter((r) => r.defensaFunciono === true).length,
    abiertos: riesgos
      .filter((r) => r.ocurrio === null)
      .map((r) => ({ id: r.id, riesgo: r.riesgo, defensa: r.defensa, isoWeek: r.week.isoWeek })),
    cerradosDetalle: cerrados.map((r) => ({
      id: r.id,
      riesgo: r.riesgo,
      isoWeek: r.week.isoWeek,
      ocurrio: r.ocurrio === true,
      defensaFunciono: r.defensaFunciono,
    })),
  }
}

// ── Catálogo de material de desarrollo ──────────────────────────────────────
// Se ordena por objetivo primero y por rubro después, no como lista alfabética:
// un catálogo suelto se lee una vez y muere. El recurso tiene que aparecer donde
// está el hueco.

export type RecursoView = {
  id: string
  tipo: string
  titulo: string
  fuente: string | null
  url: string | null
  porQue: string
  duracionMin: number | null
  cadencia: string | null
  estado: string
  veces: number
}

export type CatalogoDesarrollo = {
  // Un bloque por reactivo del nivel objetivo, con el material que lo mueve.
  // Es la vista accionable: "para el reactivo 10 de Gerente, esto".
  porObjetivo: Array<{
    orden: number
    texto: string
    conEvidencia: boolean
    recursos: RecursoView[]
  }>
  // El resto, agrupado por rubro (conducta individual o rol VP), con el rubro más
  // hueco primero — así el material aparece donde falta cobertura.
  porRubro: Array<{ rubro: string; conEvidencia: number; total: number; recursos: RecursoView[] }>
  // Ejercicios recurrentes: el 70% del 70-20-10. Se separan porque no se
  // "terminan", se practican.
  practicas: RecursoView[]
  resumen: { total: number; pendientes: number; enCurso: number; hechos: number; practicados: number }
}

const CADENCIA_UNICA = 'una vez'

export async function getCatalogoDesarrollo(userId: string): Promise<CatalogoDesarrollo> {
  const [user, recursos, competencias] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nivelObjetivo: { select: { nombre: true } } },
    }),
    prisma.learningResource.findMany({
      include: {
        competencias: { select: { id: true, tipo: true, grupo: true, orden: true, texto: true } },
        progresos: { where: { userId }, select: { estado: true, veces: true } },
      },
      orderBy: { orden: 'asc' },
    }),
    prisma.competency.findMany({
      include: { evidences: { where: { userId }, select: { id: true } } },
      orderBy: [{ grupo: 'asc' }, { orden: 'asc' }],
    }),
  ])

  function vista(r: (typeof recursos)[number]): RecursoView {
    const p = r.progresos[0]
    return {
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      fuente: r.fuente,
      url: r.url,
      porQue: r.porQue,
      duracionMin: r.duracionMin,
      cadencia: r.cadencia,
      estado: p?.estado ?? 'pendiente',
      veces: p?.veces ?? 0,
    }
  }

  const objetivo = user.nivelObjetivo?.nombre ?? null

  const porObjetivo = objetivo
    ? competencias
        .filter((c) => c.tipo === 'nivel' && c.grupo === objetivo)
        .sort((a, b) => a.orden - b.orden)
        .map((c) => ({
          orden: c.orden,
          texto: c.texto,
          conEvidencia: c.evidences.length > 0,
          recursos: recursos.filter((r) => r.competencias.some((rc) => rc.id === c.id)).map(vista),
        }))
    : []

  // Rubros: conductas individuales y roles VP. Se excluyen los de nivel, que ya
  // salieron arriba.
  const rubros = new Map<string, { conEvidencia: number; total: number; ids: Set<string> }>()
  for (const c of competencias) {
    if (c.tipo === 'nivel') continue
    const clave = c.grupo ?? GRUPO_INDIVIDUAL
    const entrada = rubros.get(clave) ?? { conEvidencia: 0, total: 0, ids: new Set<string>() }
    entrada.total += 1
    if (c.evidences.length > 0) entrada.conEvidencia += 1
    entrada.ids.add(c.id)
    rubros.set(clave, entrada)
  }

  const porRubro = [...rubros.entries()]
    .map(([rubro, e]) => ({
      rubro,
      conEvidencia: e.conEvidencia,
      total: e.total,
      recursos: recursos.filter((r) => r.competencias.some((rc) => e.ids.has(rc.id))).map(vista),
    }))
    .filter((r) => r.recursos.length > 0)
    // Más hueco primero: el material se muestra donde falta cobertura.
    .sort((a, b) => a.conEvidencia / a.total - b.conEvidencia / b.total)

  const practicas = recursos
    .filter((r) => r.tipo === 'ejercicio' && r.cadencia !== null && r.cadencia !== CADENCIA_UNICA)
    .map(vista)

  const todas = recursos.map(vista)
  return {
    porObjetivo,
    porRubro,
    practicas,
    resumen: {
      total: todas.length,
      pendientes: todas.filter((r) => r.estado === 'pendiente').length,
      enCurso: todas.filter((r) => r.estado === 'en_curso').length,
      hechos: todas.filter((r) => r.estado === 'hecho').length,
      practicados: practicas.reduce((s, r) => s + r.veces, 0),
    },
  }
}
