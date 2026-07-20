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
