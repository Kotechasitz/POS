import { Money } from '../../../../shared/money'
import type { ChartBucket } from '../../../../shared/dashboard'

export interface BarChartProps {
  data: ChartBucket[]
  ariaLabel: string
}

const WIDTH = 560
const HEIGHT = 140
const BAR_GAP = 12

function BarChart({ data, ariaLabel }: BarChartProps): React.JSX.Element {
  const maxCents = Math.max(1, ...data.map((bucket) => bucket.totalCents))
  const count = Math.max(data.length, 1)
  const barWidth = (WIDTH - BAR_GAP * (count - 1)) / count

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`} aria-label={ariaLabel} className="bar-chart">
      {data.map((bucket, index) => {
        const barHeight = (bucket.totalCents / maxCents) * HEIGHT
        const x = index * (barWidth + BAR_GAP)
        const y = HEIGHT - barHeight
        return (
          <g key={`${bucket.label}-${index}`}>
            <title>{`${bucket.label}: ${Money.fromCents(bucket.totalCents).format()}`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-chart-bar" />
            <text
              x={x + barWidth / 2}
              y={HEIGHT + 16}
              textAnchor="middle"
              className="bar-chart-label"
            >
              {bucket.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default BarChart
