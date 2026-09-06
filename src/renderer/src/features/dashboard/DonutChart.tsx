import { Money } from '../../../../shared/money'
import type { PaymentMethodBreakdown } from '../../../../shared/dashboard'
import type { PaymentMethod } from '../../../../shared/sale'

export interface DonutChartProps {
  data: PaymentMethodBreakdown[]
}

const SIZE = 160
const STROKE = 28
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const SEGMENT_CLASS: Record<PaymentMethod, string> = {
  CASH: 'donut-segment-cash',
  QR: 'donut-segment-qr',
  CARD: 'donut-segment-card'
}

function DonutChart({ data }: DonutChartProps): React.JSX.Element {
  const totalCents = data.reduce((sum, entry) => sum + entry.totalCents, 0)

  if (totalCents === 0) {
    return <p className="empty-hint">No sales yet</p>
  }

  const segments = data.reduce<
    Array<PaymentMethodBreakdown & { dash: number; offset: number; percent: number }>
  >((acc, entry) => {
    const cursor = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
    const fraction = entry.totalCents / totalCents
    const dash = fraction * CIRCUMFERENCE
    return [...acc, { ...entry, dash, offset: cursor, percent: Math.round(fraction * 100) }]
  }, [])

  return (
    <div className="donut-chart-wrap">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-label="Sales by payment method"
        className="donut-chart"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="donut-chart-track"
        />
        {segments.map((segment) => (
          <circle
            key={segment.paymentMethod}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className={`donut-chart-segment ${SEGMENT_CLASS[segment.paymentMethod]}`}
            strokeDasharray={`${segment.dash} ${CIRCUMFERENCE - segment.dash}`}
            strokeDashoffset={-segment.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          >
            <title>{`${segment.paymentMethod}: ${Money.fromCents(segment.totalCents).format()}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="donut-chart-legend">
        {segments.map((segment) => (
          <li key={segment.paymentMethod}>
            <span
              className={`donut-legend-swatch ${SEGMENT_CLASS[segment.paymentMethod]}`}
              aria-hidden="true"
            />
            <span>{segment.paymentMethod}</span>
            <span>
              {Money.fromCents(segment.totalCents).format()} ({segment.percent}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DonutChart
