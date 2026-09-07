import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DonutChart from './DonutChart'
import type { PaymentMethodBreakdown } from '../../../../shared/dashboard'

const breakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 6000, count: 3 },
  { paymentMethod: 'QR', totalCents: 3000, count: 2 },
  { paymentMethod: 'CARD', totalCents: 1000, count: 1 }
]

describe('DonutChart', () => {
  it('renders one ring segment per payment method with sales', () => {
    const { container } = render(<DonutChart data={breakdown} />)
    expect(container.querySelectorAll('.donut-chart-segment')).toHaveLength(3)
  })

  it('renders a legend row per payment method, using the shared display label (not the raw enum value), with its amount and percentage of the total', () => {
    render(<DonutChart data={breakdown} />)
    // Total is 10000 -> CASH is 60%, QR is 30%, CARD is 10%. Labels come
    // from the same PAYMENT_METHOD_LABELS map the checkout modal uses
    // ('Cash'/'QR'/'Card'), not the raw 'CASH'/'QR'/'CARD' enum values.
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.queryByText('CASH')).not.toBeInTheDocument()
    expect(screen.getByText('฿60.00 (60%)')).toBeInTheDocument()
    expect(screen.getByText('QR')).toBeInTheDocument()
    expect(screen.getByText('฿30.00 (30%)')).toBeInTheDocument()
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.queryByText('CARD')).not.toBeInTheDocument()
    expect(screen.getByText('฿10.00 (10%)')).toBeInTheDocument()
  })

  it('shows an empty hint instead of a chart when there are no sales in the period', () => {
    const { container } = render(<DonutChart data={[]} />)
    expect(container.querySelectorAll('.donut-chart-segment')).toHaveLength(0)
    expect(screen.getByText('No sales yet')).toBeInTheDocument()
  })
})
