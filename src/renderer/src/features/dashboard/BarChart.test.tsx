import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BarChart from './BarChart'
import type { ChartBucket } from '../../../../shared/dashboard'

const sevenDays: ChartBucket[] = [
  { label: 'Fri', totalCents: 1000 },
  { label: 'Sat', totalCents: 0 },
  { label: 'Sun', totalCents: 3000 },
  { label: 'Mon', totalCents: 2000 },
  { label: 'Tue', totalCents: 0 },
  { label: 'Wed', totalCents: 5000 },
  { label: 'Thu', totalCents: 4000 }
]

describe('BarChart', () => {
  it('renders one bar per bucket', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('scales the tallest bar taller than a shorter one', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    const bars = container.querySelectorAll('.bar-chart-bar')
    const heights = Array.from(bars).map((bar) => Number(bar.getAttribute('height')))
    expect(heights[5]).toBeGreaterThan(heights[0])
    expect(heights[1]).toBe(0)
  })

  it('renders without error when every bucket is zero', () => {
    const empty: ChartBucket[] = sevenDays.map((bucket) => ({ ...bucket, totalCents: 0 }))
    const { container } = render(<BarChart data={empty} ariaLabel="Sales for the last 7 days" />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('renders each bucket using exactly the label it was given, unmodified', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />)
    const labels = container.querySelectorAll('.bar-chart-label')
    expect(Array.from(labels).map((el) => el.textContent)).toEqual([
      'Fri',
      'Sat',
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu'
    ])
  })

  it('uses the given aria-label, so the same component can describe either an hourly or a daily chart', () => {
    const { container } = render(<BarChart data={sevenDays} ariaLabel="Sales by hour, today" />)
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Sales by hour, today')
  })
})
