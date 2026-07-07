export type DayBlock = {
  id: string
  inicio: string // "HH:MM" | "flex"
  fin: string
  done: boolean
}

export type CurrentPick =
  | { kind: 'current'; block: DayBlock }
  | { kind: 'next'; block: DayBlock }
  | { kind: 'none'; block: null }

export function pickCurrentBlock(blocks: DayBlock[], nowHHMM: string): CurrentPick {
  const activos = blocks.filter((b) => !b.done && b.inicio !== 'flex')

  const current = activos.find((b) => b.inicio <= nowHHMM && nowHHMM < b.fin)
  if (current) return { kind: 'current', block: current }

  const upcoming = activos.filter((b) => b.inicio > nowHHMM).sort((a, b) => a.inicio.localeCompare(b.inicio))
  if (upcoming[0]) return { kind: 'next', block: upcoming[0] }

  return { kind: 'none', block: null }
}
