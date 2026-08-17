import type { DesvioCausa } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Reconciliación de cierre de día (Fase 1 del plan del council).
//
// El diagnóstico que originó esto: el factor de realismo (1.4) sostiene el ritual
// semanal completo —capacidad, carga, triage, colchón— y no se puede calibrar
// porque el dato no existe. La W32 registró 826 min planeados contra 32 medidos.
//
// El hueco tiene DOS causas y hay que separarlas: una es disciplina (no
// cronometrar), que se construye y no se rodea; la otra es la naturaleza del
// trabajo —bomberazos y cambios de prioridad del cliente que rompen el plan y hoy
// no se registran en ninguna parte. Tratarlas como una sola lleva a la conclusión
// equivocada de reemplazar el cronómetro.
//
// Por eso esto NO sustituye al cronómetro: lo audita. Si la causa dominante
// durante semanas es "trabajé sin cronometrar", eso es un dato de disciplina y se
// ve. Si es "bomberazo", es un dato de negociación con el cliente y también se ve.

export const CAUSAS: DesvioCausa[] = [
  'bomberazo',
  'cambio_prioridad_cliente',
  'junta_se_alargo',
  'trabajo_sin_cronometro',
]

export const CAUSA_LABEL: Record<DesvioCausa, string> = {
  bomberazo: 'Bomberazo',
  cambio_prioridad_cliente: 'Cambio de prioridad del cliente',
  junta_se_alargo: 'Junta que se alargó o apareció',
  trabajo_sin_cronometro: 'Trabajé sin cronómetro',
}

export const CAUSA_QUE_SIGNIFICA: Record<DesvioCausa, string> = {
  bomberazo: 'Cuántas horas se van a trabajo no comprometido, y de qué stakeholder vienen.',
  cambio_prioridad_cliente: 'Insumo directo para renegociar alcance — evidencia, no percepción.',
  junta_se_alargo: 'Corrige la capacidad real, que hoy se calcula del calendario nominal.',
  trabajo_sin_cronometro: 'Distingue "no lo hice" de "lo hice y no lo medí". Es un dato de disciplina.',
}

// Cada causa lleva a un trabajo distinto, y esa es toda la razón de clasificar.
export const CAUSA_A_QUIEN_TOCA: Record<DesvioCausa, string> = {
  bomberazo: 'cliente',
  cambio_prioridad_cliente: 'cliente',
  junta_se_alargo: 'código',
  trabajo_sin_cronometro: 'disciplina',
}

export type DesvioView = {
  id: string
  causa: DesvioCausa
  minutos: number
  stakeholderId: string | null
  stakeholderNombre: string | null
  taskId: string | null
  taskTitulo: string | null
  nota: string | null
}

export type TareaDelDia = {
  id: string
  titulo: string
  estatus: string
  planMin: number
  medidoMin: number
  // Terminada sin un solo segundo de cronómetro: el caso exacto que la
  // reconciliación tiene que sacar a la luz.
  hechaSinMedir: boolean
}

export type CierreDia = {
  fecha: string
  yaReconciliado: boolean
  nota: string | null
  desvios: DesvioView[]
  tareas: TareaDelDia[]
  planMin: number
  medidoMin: number
  // Lo planeado que no aparece en ningún cronómetro. Es el número que la pantalla
  // pide explicar, y el que hoy se pierde completo.
  huecoMin: number
  // Minutos ya explicados por desvíos registrados. Cuando cubre el hueco, el día
  // está cerrado de verdad.
  explicadoMin: number
  // Sugerencia de arranque para que el cierre tome 60 s y no sea otro formulario:
  // si hay tareas hechas sin cronómetro, la causa más probable ya viene propuesta.
  sugerencia: { causa: DesvioCausa; minutos: number; taskId: string | null } | null
  stakeholders: Array<{ id: string; nombre: string }>
  // Pendientes que todavía están en este día y se pueden pasar al siguiente día
  // hábil. Mover es el ÚLTIMO paso del cierre, no el primero: hacerlo antes
  // borraba la evidencia de qué se había planeado.
  pendientesPorMover: number
  // Si ya se movieron, cuántos y a dónde. Responde "¿qué pasó el lunes?" sin
  // depender de la memoria.
  yaMovidos: { cuantos: number; hacia: string } | null
  // true cuando lo planeado viene del snapshot y no de los bloques vivos.
  desdeSnapshot: boolean
  proyectos: Array<{ id: string; nombre: string; tieneTarifa: boolean }>
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getCierreDia(userId: string, fecha: string): Promise<CierreDia> {
  const dia = new Date(fecha)

  const [bloques, reconciliacion, stakeholders, proyectos] = await Promise.all([
    prisma.block.findMany({
      where: { fecha: dia, week: { userId }, tipo: 'tarea' },
      include: { task: { include: { timeEntries: { select: { seconds: true } } } } },
      orderBy: { orden: 'asc' },
    }),
    prisma.dayReconciliation.findUnique({
      where: { userId_fecha: { userId, fecha: dia } },
      include: {
        desvios: {
          orderBy: { orden: 'asc' },
          include: { stakeholder: { select: { nombre: true } }, task: { select: { titulo: true } } },
        },
      },
    }),
    prisma.stakeholder.findMany({ where: { userId }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.project.findMany({
      where: { userId, estatus: 'activo' },
      select: { id: true, nombre: true, tarifaHora: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  // Un bloque por tarea es lo normal, pero si el reflow partió una tarea en dos
  // bloques el mismo día, sus minutos medidos son los MISMOS: sumarlos por bloque
  // los contaría doble e inventaría medición que no existe.
  const porTarea = new Map<string, TareaDelDia>()
  let planSinTarea = 0

  for (const b of bloques) {
    if (!b.task) {
      planSinTarea += b.planMin
      continue
    }
    const previa = porTarea.get(b.task.id)
    if (previa) {
      previa.planMin += b.planMin
      continue
    }
    const medidoMin = Math.round(b.task.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60)
    porTarea.set(b.task.id, {
      id: b.task.id,
      titulo: b.task.titulo,
      estatus: b.task.estatus,
      planMin: b.planMin,
      medidoMin,
      hechaSinMedir: b.task.estatus === 'done' && medidoMin === 0,
    })
  }

  const tareas = [...porTarea.values()]

  // Si ya se pasaron los pendientes, los bloques que se movieron dejaron de tener
  // esta fecha y el cálculo en vivo daría cero. El snapshot que se tomó ANTES de
  // mover es la única versión fiel de qué se había planeado ese día.
  const desdeSnapshot = reconciliacion?.planMinCierre != null
  const planMin = desdeSnapshot ? reconciliacion!.planMinCierre! : tareas.reduce((s, t) => s + t.planMin, 0) + planSinTarea
  const medidoMin = desdeSnapshot
    ? (reconciliacion!.medidoMinCierre ?? 0)
    : tareas.reduce((s, t) => s + t.medidoMin, 0)
  const huecoMin = Math.max(0, planMin - medidoMin)

  const desvios: DesvioView[] = (reconciliacion?.desvios ?? []).map((d) => ({
    id: d.id,
    causa: d.causa,
    minutos: d.minutos,
    stakeholderId: d.stakeholderId,
    stakeholderNombre: d.stakeholder?.nombre ?? null,
    taskId: d.taskId,
    taskTitulo: d.task?.titulo ?? null,
    nota: d.nota,
  }))

  const sinMedir = tareas.filter((t) => t.hechaSinMedir)

  return {
    fecha,
    yaReconciliado: reconciliacion !== null,
    nota: reconciliacion?.nota ?? null,
    desvios,
    tareas,
    planMin,
    medidoMin,
    huecoMin,
    explicadoMin: desvios.reduce((s, d) => s + d.minutos, 0),
    sugerencia:
      // Solo se sugiere si el día no se ha reconciliado: proponer sobre lo ya
      // clasificado sería empujar a duplicar.
      reconciliacion === null && sinMedir.length > 0 && huecoMin > 0
        ? {
            causa: 'trabajo_sin_cronometro',
            minutos: Math.min(huecoMin, sinMedir.reduce((s, t) => s + t.planMin, 0)),
            taskId: sinMedir.length === 1 ? sinMedir[0].id : null,
          }
        : null,
    stakeholders,
    // Solo lo que sigue abierto: una tarea terminada no se pasa a mañana.
    pendientesPorMover: tareas.filter((t) => t.estatus === 'planned' || t.estatus === 'in_progress').length,
    yaMovidos:
      reconciliacion?.movidos != null && reconciliacion.movidosA != null
        ? { cuantos: reconciliacion.movidos, hacia: iso(reconciliacion.movidosA) }
        : null,
    desdeSnapshot,
    proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.nombre, tieneTarifa: p.tarifaHora !== null })),
  }
}

// ── El patrón: qué causa domina ──────────────────────────────────────────────
//
// La compuerta del plan son dos semanas, y lo que se evalúa NO es si el factor de
// realismo sobrevive —sobrevive, es el objetivo— sino qué causa domina, porque
// cada una lleva a un trabajo distinto: disciplina (Mau), renegociación de
// alcance (cliente), o corrección del cálculo de capacidad (código).

export type PatronDesvios = {
  desde: string
  hasta: string
  diasReconciliados: number
  totalMin: number
  porCausa: Array<{ causa: DesvioCausa; label: string; minutos: number; pct: number; aQuienToca: string }>
  dominante: DesvioCausa | null
  // De dónde vienen los bomberazos. Es el argumento con el cliente, y no se puede
  // construir sin registrar el stakeholder en el momento.
  origenUrgencias: Array<{ nombre: string; minutos: number }>
}

export async function getPatronDesvios(
  userId: string,
  desde: string,
  hasta: string
): Promise<PatronDesvios> {
  const cierres = await prisma.dayReconciliation.findMany({
    where: { userId, fecha: { gte: new Date(desde), lte: new Date(hasta) } },
    include: { desvios: { include: { stakeholder: { select: { nombre: true } } } } },
  })

  const todos = cierres.flatMap((c) => c.desvios)
  const totalMin = todos.reduce((s, d) => s + d.minutos, 0)

  const porCausa = CAUSAS.map((causa) => {
    const minutos = todos.filter((d) => d.causa === causa).reduce((s, d) => s + d.minutos, 0)
    return {
      causa,
      label: CAUSA_LABEL[causa],
      minutos,
      pct: totalMin > 0 ? Math.round((minutos / totalMin) * 100) : 0,
      aQuienToca: CAUSA_A_QUIEN_TOCA[causa],
    }
  }).sort((a, b) => b.minutos - a.minutos)

  const urgencias = new Map<string, number>()
  for (const d of todos) {
    if (d.causa !== 'bomberazo' && d.causa !== 'cambio_prioridad_cliente') continue
    const nombre = d.stakeholder?.nombre ?? 'Sin identificar'
    urgencias.set(nombre, (urgencias.get(nombre) ?? 0) + d.minutos)
  }

  return {
    desde,
    hasta,
    diasReconciliados: cierres.length,
    totalMin,
    porCausa,
    // Sin minutos no hay dominante. Declarar una causa ganadora con cero datos es
    // exactamente el error que el plan pide no repetir.
    dominante: totalMin > 0 && porCausa[0].minutos > 0 ? porCausa[0].causa : null,
    origenUrgencias: [...urgencias.entries()]
      .map(([nombre, minutos]) => ({ nombre, minutos }))
      .sort((a, b) => b.minutos - a.minutos),
  }
}

// Ventana por defecto de la compuerta: 14 días hacia atrás, incluyendo hoy.
export function ventanaCompuerta(hoy: Date): { desde: string; hasta: string } {
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - 13)
  return { desde: iso(desde), hasta: iso(hoy) }
}

// ── Escritura: mover pendientes y registrar trabajo no planeado ──────────────
// Viven aquí y no en actions.ts porque la regla del proyecto es que las dos capas
// de auth llamen la MISMA lógica. De paso, se pueden probar sin sesión.

function siguienteDiaHabil(fecha: string): string {
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + 1)
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Pasa los pendientes sin terminar al siguiente día hábil — el ÚLTIMO paso del
// cierre.
//
// El orden importa y antes estaba invertido: mover un bloque le cambia `fecha` en
// el mismo registro, y lo planeado se calcula leyendo bloques por fecha. Al mover
// primero, el día quedaba en cero y la reconciliación se volvía imposible: fue lo
// que pasó el 13-ago-2026. El snapshot se toma ANTES de mover.
export async function pasarPendientes(userId: string, fecha: string): Promise<{ movidos: number; hacia: string }> {
  const dia = new Date(fecha)
  if (Number.isNaN(dia.getTime())) throw new Error('fecha inválida')

  const bloques = await prisma.block.findMany({
    where: { fecha: dia, week: { userId }, tipo: 'tarea' },
    include: { task: { select: { id: true, estatus: true, timeEntries: { select: { seconds: true } } } } },
    orderBy: { orden: 'asc' },
  })

  // El snapshot cubre TODO lo planeado del día, no solo lo que se mueve: es la
  // línea base contra la que se lee el hueco. La medición se deduplica por tarea
  // porque un reflow pudo partirla en dos bloques con los mismos TimeEntries.
  const planMin = bloques.reduce((s, b) => s + b.planMin, 0)
  const medidos = new Map<string, number>()
  for (const b of bloques) {
    if (b.task && !medidos.has(b.task.id)) {
      medidos.set(b.task.id, Math.round(b.task.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60))
    }
  }
  const medidoMin = [...medidos.values()].reduce((s, m) => s + m, 0)

  const porMover = bloques.filter((b) => b.task?.estatus === 'planned' || b.task?.estatus === 'in_progress')
  const hacia = siguienteDiaHabil(fecha)

  await prisma.$transaction(async (tx) => {
    const previo = await tx.dayReconciliation.findUnique({
      where: { userId_fecha: { userId, fecha: dia } },
      select: { id: true, planMinCierre: true },
    })

    if (previo === null) {
      await tx.dayReconciliation.create({
        data: {
          userId,
          fecha: dia,
          planMinCierre: planMin,
          medidoMinCierre: medidoMin,
          movidos: porMover.length,
          movidosA: new Date(hacia),
        },
      })
    } else {
      await tx.dayReconciliation.update({
        where: { id: previo.id },
        data: {
          // El snapshot NO se sobrescribe si ya existía: el primero es el que se
          // tomó con los bloques completos. Pasar pendientes una segunda vez
          // (cuando ya quedan menos) lo degradaría a un número más chico.
          ...(previo.planMinCierre === null ? { planMinCierre: planMin, medidoMinCierre: medidoMin } : {}),
          movidos: { increment: porMover.length },
          movidosA: new Date(hacia),
        },
      })
    }

    if (porMover.length > 0) {
      const semana = await tx.week.findFirst({
        where: { userId, rangoInicio: { lte: new Date(hacia) }, rangoFin: { gte: new Date(hacia) } },
        select: { id: true },
      })
      const maxOrden = await tx.block.aggregate({
        where: { fecha: new Date(hacia), week: { userId } },
        _max: { orden: true },
      })
      let orden = (maxOrden._max.orden ?? 0) + 1
      for (const b of porMover) {
        await tx.block.update({
          where: { id: b.id },
          data: { fecha: new Date(hacia), orden: orden++, ...(semana ? { weekId: semana.id } : {}) },
        })
      }
    }
  })

  return { movidos: porMover.length, hacia }
}

// Convierte un desvío en trabajo registrado.
//
// Sin esto, el trabajo no planeado moría como texto libre en la nota del desvío:
// alimentaba el patrón de causas pero NUNCA llegaba al ledger Aliado ni generaba
// evidencia de competencias, que es donde está el valor de negocio. Cargar la
// bitácora del 13-14 de agosto requirió un script a mano por exactamente esto.
export async function convertirDesvioEnTarea(
  userId: string,
  input: {
    titulo: string
    minutos: number
    projectId: string
    alcance: 'aliado' | 'sow'
    dolorCliente?: string
    fecha: string
  }
): Promise<{ taskId: string }> {
  const titulo = input.titulo.trim()
  if (titulo === '') throw new Error('la tarea necesita un título')
  if (input.minutos <= 0) throw new Error('la tarea necesita minutos')

  const proyecto = await prisma.project.findFirst({
    where: { id: input.projectId, userId },
    select: { id: true },
  })
  if (!proyecto) throw new Error('proyecto no encontrado')

  // El dolor del cliente es lo que distingue trabajo aliado de una fuga de horas.
  // Sin él, el ledger acumula horas que no se pueden defender en una negociación,
  // que es su única razón de existir.
  const dolor = input.dolorCliente?.trim() || null
  if (input.alcance === 'aliado' && dolor === null) {
    throw new Error('el trabajo aliado necesita el dolor del cliente que atendió')
  }

  const fecha = new Date(input.fecha)
  const semana = await prisma.week.findFirst({
    where: { userId, rangoInicio: { lte: fecha }, rangoFin: { gte: fecha } },
    select: { id: true },
  })

  const task = await prisma.task.create({
    data: {
      userId,
      projectId: proyecto.id,
      weekId: semana?.id,
      titulo,
      // estimadoMin queda NULL: este trabajo nunca se estimó. Ponerle una
      // estimación igual al esfuerzo daría un ratio real/estimado de 1.0 exacto y
      // jalaría el factor de realismo hacia 1.0 con un dato inventado.
      estimadoMin: null,
      estatus: 'done',
      alcance: input.alcance,
      dolorCliente: dolor,
      timeEntries: {
        create: {
          userId,
          startedAt: fecha,
          stoppedAt: fecha,
          seconds: Math.round(input.minutos * 60),
          // No salió del cronómetro y el dato tiene que decirlo.
          manual: true,
        },
      },
    },
  })

  return { taskId: task.id }
}
