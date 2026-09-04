'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'
import { isoWeekAPlanear, diaSemanaMx } from '@/lib/dates'
import { componerReflexion, validarCarga, isoWeekValida } from './service'
import { borrarSemana } from './borrar'
import { factorPorClase } from '@/lib/factor-clase'
import { factorDeClase } from '@/lib/tipo-trabajo'
import type { TipoTrabajo } from '@prisma/client'

export type NuevaSemanaWin = { titulo: string; dod?: string; siEntonces?: string }

// Una tarea del ritual puede venir del backlog (ya existe: `id`) o haberse
// capturado en el paso 3 (nueva: sin `id`). Se resuelven por caminos distintos
// —adoptar vs. crear— porque `tasks` en createWeekPayload siempre hace create y
// duplicaría los pendientes del backlog.
export type NuevaSemanaTask = {
  id?: string
  ref: string
  titulo: string
  projectNombre?: string
  winPosicion?: number
  estimadoMin: number
  dod: string[]
  // Día al que se asignó en el paso 4. Sin día, la tarea entra a la semana pero
  // sin bloque: queda en el parking lot de /dia.
  fecha?: string
  // Competencia que esta tarea va a ejercitar, elegida en el paso 3.
  competenciaId?: string
  // Clase de trabajo elegida (o aceptada de la sugerencia) en el paso 3.
  tipoTrabajo?: TipoTrabajo
}

export type CrearSemanaInput = {
  /** Semana que se está planeando. Sin ella se usa la que ENTRA, no la actual. */
  isoWeek?: string
  reflexion?: string
  // La cuarta pregunta del AAR del paso 1. Llega aparte del recap y se une a él
  // aquí (`componerReflexion`): el cliente no decide el formato de lo que se
  // guarda.
  queCambias?: string
  desbloqueador?: string
  riesgos?: Array<{ riesgo: string; defensa: string }>
  wins: NuevaSemanaWin[]
  tasks: NuevaSemanaTask[]
}

export async function crearSemanaAction(input: CrearSemanaInput) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
  const factorUsado = user.factorManual ? Number(user.factorManual) : 1.4
  // El ajuste va POR CLASE: cada tarea se corrige con el factor de su tipo de
  // trabajo y cae al global solo donde esa clase no tiene muestras suficientes.
  // Se recalcula aquí y no se confía en lo que mandó el cliente, igual que el
  // tope de carga: la pantalla propone, el servidor decide qué se escribe.
  const factoresClase = await factorPorClase(session.userId)
  const ajustado = (min: number, tipo?: TipoTrabajo) =>
    Math.round(min * factorDeClase(tipo, factoresClase, factorUsado))

  // La semana viene del planeador (que la recibió por searchParam) y se valida
  // aquí: `isoWeekOf(new Date())` fijaba la semana EN CURSO, así que planear la
  // que entra escribía el plan en la semana equivocada. El default es la que
  // entra, el mismo que usa `contextoPlaneacion`.
  const ahora = new Date()
  const isoWeek = isoWeekValida(input.isoWeek) ?? isoWeekAPlanear(ahora, diaSemanaMx(ahora))

  // El tope de carga se revalida en el servidor y no solo en el wizard: el botón
  // deshabilitado es una cortesía de UI, la restricción es esta. Se calcula con
  // el MISMO factor con el que se van a guardar los ajustadoMin, para que lo que
  // se valida sea exactamente lo que se escribe.
  const cargaAjustadaMin = input.tasks.reduce(
    (s, t) => s + ajustado(t.estimadoMin > 0 ? t.estimadoMin : 30, t.tipoTrabajo),
    0
  )
  const carga = validarCarga(cargaAjustadaMin, await capacityForWeek(session.userId, isoWeek))
  if (!carga.ok) throw new Error(carga.mensaje!)

  const nuevas = input.tasks.filter((t) => !t.id)
  const delBacklog = input.tasks.filter((t) => t.id)

  // Las competencias vienen del <select> del cliente, así que se validan contra el
  // catálogo antes de conectarlas: un id inventado reventaría la transacción
  // completa por violación de llave foránea y tiraría los 10 min del ritual.
  const pedidas = [...new Set(input.tasks.map((t) => t.competenciaId).filter((id): id is string => Boolean(id)))]
  const validas = new Set(
    pedidas.length > 0
      ? (await prisma.competency.findMany({ where: { id: { in: pedidas } }, select: { id: true } })).map((c) => c.id)
      : []
  )
  const competenciasDe = (t: NuevaSemanaTask): string[] | undefined =>
    t.competenciaId && validas.has(t.competenciaId) ? [t.competenciaId] : undefined

  await createWeekPayload(session.userId, {
    isoWeek,
    factorUsado,
    reflexion: componerReflexion(input.reflexion ?? '', input.queCambias ?? ''),
    desbloqueador: input.desbloqueador,
    riesgos: input.riesgos,
    // El planeador sí reutiliza el cascarón que Mi Día haya creado — de otro modo
    // planear el lunes después de abrir Mi Día es imposible. La guarda de "ya
    // tiene plan" sigue protegiendo contra duplicar una semana real.
    reutilizarVacia: true,
    wins: input.wins.map((w, i) => ({ posicion: i + 1, titulo: w.titulo, dod: w.dod, siEntonces: w.siEntonces })),
    tasks: nuevas.map((t) => ({
      ref: t.ref,
      titulo: t.titulo,
      projectNombre: t.projectNombre,
      winPosicion: t.winPosicion,
      estimadoMin: t.estimadoMin,
      ajustadoMin: ajustado(t.estimadoMin, t.tipoTrabajo),
      tipoTrabajo: t.tipoTrabajo,
      dod: t.dod,
      competenciaIds: competenciasDe(t),
    })),
    adoptar: delBacklog.map((t) => ({
      id: t.id!,
      winPosicion: t.winPosicion,
      estimadoMin: t.estimadoMin,
      ajustadoMin: ajustado(t.estimadoMin, t.tipoTrabajo),
      tipoTrabajo: t.tipoTrabajo,
      competenciaIds: competenciasDe(t),
    })),
    // Bloques "flex": el ritual decide EN QUÉ DÍA va cada tarea, no a qué hora.
    // La hora se acomoda en /dia con el reflow, que ya conoce juntas y jornada.
    blocks: input.tasks
      .filter((t) => t.fecha)
      .map((t) => ({
        fecha: t.fecha!,
        inicio: 'flex',
        fin: 'flex',
        tipo: 'tarea' as const,
        taskRef: t.id ?? t.ref,
        titulo: t.titulo,
        planMin: ajustado(t.estimadoMin, t.tipoTrabajo),
      })),
  })

  // NO se redirige desde aquí. `redirect()` de Next funciona LANZANDO un error
  // (NEXT_REDIRECT), y el cliente espera esta action dentro de un try/catch para
  // poder devolver el borrador si algo falla. Ese catch se tragaba el redirect: la
  // semana sí se creaba, pero el usuario se quedaba en el planeador con un mensaje
  // de error falso y el draft restaurado. La navegación la hace el cliente con
  // router.push cuando esto resuelve sin lanzar.
}

// Envoltura de sesión de `borrarSemana`: resuelve quién eres, delega la lógica
// y revalida. La lógica vive en `./borrar` para poder probarla sin sesión.
export async function borrarSemanaAction(isoWeek: string): Promise<{ ok: true } | { error: string }> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const r = await borrarSemana(session.userId, isoWeek)
  if ('ok' in r) {
    revalidatePath('/semana')
    revalidatePath('/semana/nueva')
    revalidatePath('/dia')
  }
  return r
}
