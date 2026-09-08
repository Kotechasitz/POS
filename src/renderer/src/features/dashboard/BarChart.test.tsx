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
    const { container } = render(
      <BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />
    )
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('scales the tallest bar taller than a shorter one', () => {
    const { container } = render(
      <BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />
    )
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
    const { container } = render(
      <BarChart data={sevenDays} ariaLabel="Sales for the last 7 days" />
    )
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

  it('renders all 24 hourly buckets with tooltips but thins the visible labels, unlike the 7-bucket view', () => {
    const hours = [
      '12 AM',
      '1 AM',
      '2 AM',
      '3 AM',
      '4 AM',
      '5 AM',
      '6 AM',
      '7 AM',
      '8 AM',
      '9 AM',
      '10 AM',
      '11 AM',
      '12 PM',
      '1 PM',
      '2 PM',
      '3 PM',
      '4 PM',
      '5 PM',
      '6 PM',
      '7 PM',
      '8 PM',
      '9 PM',
      '10 PM',
      '11 PM'
    ]
    const hourly: ChartBucket[] = hours.map((label, index) => ({
      label,
      totalCents: (index + 1) * 100
    }))
    const { container } = render(<BarChart data={hourly} ariaLabel="Sales by hour, today" />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(24)
    expect(container.querySelectorAll('.bar-chart-label').length).toBeLessThan(24)
  })
})
