import { Money } from '../../../../shared/money'
import type { ChartBucket } from '../../../../shared/dashboard'

export interface BarChartProps {
  data: ChartBucket[]
  ariaLabel: string
}

const WIDTH = 560
const HEIGHT = 140
const BAR_GAP_NORMAL = 12
const BAR_GAP_DENSE = 3
const DENSE_THRESHOLD = 12
const LABEL_EVERY_NTH = 3

function BarChart({ data, ariaLabel }: BarChartProps): React.JSX.Element {
  const maxCents = Math.max(1, ...data.map((bucket) => bucket.totalCents))
  const count = Math.max(data.length, 1)
  const isDense = count > DENSE_THRESHOLD
  const barGap = isDense ? BAR_GAP_DENSE : BAR_GAP_NORMAL
  const barWidth = (WIDTH - barGap * (count - 1)) / count

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`} aria-label={ariaLabel} className="bar-chart">
      {data.map((bucket, index) => {
        const barHeight = (bucket.totalCents / maxCents) * HEIGHT
        const x = index * (barWidth + barGap)
        const y = HEIGHT - barHeight
        const showLabel = !isDense || index % LABEL_EVERY_NTH === 0
        return (
          <g key={`${bucket.label}-${index}`}>
            <title>{`${bucket.label}: ${Money.fromCents(bucket.totalCents).format()}`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-chart-bar" />
            {showLabel && (
              <text
                x={x + barWidth / 2}
                y={HEIGHT + 16}
                textAnchor="middle"
                className="bar-chart-label"
              >
                {bucket.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default BarChart
