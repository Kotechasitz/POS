import { Money } from '../../../../shared/money'
import type { DailySales } from '../../../../shared/dashboard'

export interface BarChartProps {
  data: DailySales[]
}

const WIDTH = 560
const HEIGHT = 140
const BAR_GAP = 12

// Parses a 'YYYY-MM-DD' string as a local date, not UTC — `new Date(str)`
// parses that format as UTC midnight, which can render as the wrong
// weekday depending on the viewer's timezone offset.
function parseDateOnlyLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function BarChart({ data }: BarChartProps): React.JSX.Element {
  const maxCents = Math.max(1, ...data.map((day) => day.totalCents))
  const count = Math.max(data.length, 1)
  const barWidth = (WIDTH - BAR_GAP * (count - 1)) / count

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`}
      role="img"
      aria-label="Sales for the last 7 days"
      className="bar-chart"
    >
      {data.map((day, index) => {
        const barHeight = (day.totalCents / maxCents) * HEIGHT
        const x = index * (barWidth + BAR_GAP)
        const y = HEIGHT - barHeight
        const label = parseDateOnlyLocal(day.date).toLocaleDateString(undefined, {
          weekday: 'short'
        })
        return (
          <g key={day.date}>
            <title>{`${day.date}: ${Money.fromCents(day.totalCents).format()}`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-chart-bar" />
            <text
              x={x + barWidth / 2}
              y={HEIGHT + 16}
              textAnchor="middle"
              className="bar-chart-label"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default BarChart
