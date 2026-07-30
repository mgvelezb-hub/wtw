export type FocusBlock = {
  id: string
  inicio: string // "HH:MM" | "flex"
  fin: string
  tipo: string
  titulo: string
  planMin: number
  taskId: string | null
  done: boolean
  externa: boolean
  bloqueante: boolean
  runningSince: string | null
}

export function getActiveBlock<T extends FocusBlock>(blocks: T[]): T | null {
  return blocks.find((b) => b.runningSince !== null) ?? null
}

export function getNextTaskBlock<T extends FocusBlock>(blocks: T[], afterInicio: string): T | null {
  const candidatos = blocks
    .filter(
      (b) =>
        b.tipo === 'tarea' &&
        !b.externa &&
        !b.done &&
        b.taskId !== null &&
        b.inicio !== 'flex' &&
        b.inicio > afterInicio
    )
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  return candidatos[0] ?? null
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export type UpcomingMeeting<T> = { block: T; minutesUntil: number; highlight: boolean }

export function getUpcomingMeeting<T extends FocusBlock>(
  blocks: T[],
  nowHHMM: string,
  thresholdMin: number
): UpcomingMeeting<T> | null {
  const juntas = blocks
    .filter((b) => b.externa && b.bloqueante && !b.done && b.inicio !== 'flex' && b.inicio > nowHHMM)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const next = juntas[0]
  if (!next) return null
  const minutesUntil = toMin(next.inicio) - toMin(nowHHMM)
  return { block: next, minutesUntil, highlight: minutesUntil <= thresholdMin }
}

export type BreakSuggestion = { umbralMin: number; breakMin: number; actividad: string }

// Basado en investigación de microbreaks (Albulescu et al. 2022): tareas de
// alta complejidad no se benefician de interrupciones frecuentes (el costo de
// retomar el foco es alto), pero sí de un descanso más largo cuando ocurre.
export function getBreakSuggestion(planMin: number): BreakSuggestion {
  if (planMin > 60) {
    return { umbralMin: 50, breakMin: 10, actividad: 'Camina, estira, o toca guitarra unos minutos.' }
  }
  return { umbralMin: 30, breakMin: 5, actividad: 'Ponte de pie, estira, o mira por la ventana.' }
}

// Al pausar, runningSince vuelve a null y getActiveBlock ya no encuentra la
// tarea — por eso FocusView recuerda su taskId aparte. Ese recuerdo empieza
// en null, y comparar `b.taskId === null` haría match con CUALQUIER bloque
// sin tarea (juntas externas) en vez de significar "nada seleccionado" — de
// ahí el guard explícito.
export function pickRememberedActivity<T extends FocusBlock>(
  blocks: T[],
  focusTaskId: string | null,
  runningNow: T | null
): T | null {
  const remembered = focusTaskId ? blocks.find((b) => b.taskId === focusTaskId) ?? null : null
  return remembered && !remembered.done ? remembered : runningNow
}
