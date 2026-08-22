import { Sparkline } from './Sparkline'

type TrendCardProps = {
  title: string
  /** Serie cronológica (más antigua primero, más reciente al final). */
  values: (number | null)[]
  /** isoWeek alineado 1:1 con `values`, mismo orden cronológico. */
  isoWeeks: string[]
  formatValue: (v: number) => string
  formatDelta: (delta: number) => string
  /** Override del valor destacado (ej. "2/3" en vez de solo "2"). */
  lastValueLabel?: string
  emptyMessage: string
}

function shortWeekLabel(isoWeek: string): string {
  const match = isoWeek.match(/W\d+/)
  return match ? match[0] : isoWeek
}

function lastKnown(values: (number | null)[]): { index: number; value: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null) return { index: i, value: v }
  }
  return null
}

export function TrendCard({ title, values, isoWeeks, formatValue, formatDelta, lastValueLabel, emptyMessage }: TrendCardProps) {
  const last = lastKnown(values)

  return (
    <div className="border-t border-hair pt-3">
      <p className="lbl">{title}</p>

      {last === null ? (
        <p className="mt-2 text-xs text-faint">{emptyMessage}</p>
      ) : (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div>
            <p className="num text-lg font-semibold text-ink">{lastValueLabel ?? formatValue(last.value)}</p>
            {(() => {
              const prev = lastKnown(values.slice(0, last.index))
              if (!prev) return <p className="text-xs text-faint">Primera semana con dato</p>
              const delta = last.value - prev.value
              return (
                <p className="num text-xs text-muted">
                  {formatDelta(delta)} vs {shortWeekLabel(isoWeeks[prev.index])}
                </p>
              )
            })()}
          </div>
          <Sparkline values={values} />
        </div>
      )}
    </div>
  )
}
