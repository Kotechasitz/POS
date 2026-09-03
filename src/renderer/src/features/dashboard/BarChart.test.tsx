import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BarChart from './BarChart'
import type { DailySales } from '../../../../shared/dashboard'

const sevenDays: DailySales[] = [
  { date: '2026-08-28', totalCents: 1000 },
  { date: '2026-08-29', totalCents: 0 },
  { date: '2026-08-30', totalCents: 3000 },
  { date: '2026-08-31', totalCents: 2000 },
  { date: '2026-09-01', totalCents: 0 },
  { date: '2026-09-02', totalCents: 5000 },
  { date: '2026-09-03', totalCents: 4000 }
]

describe('BarChart', () => {
  it('renders one bar per day', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('scales the tallest bar taller than a shorter one', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    const bars = container.querySelectorAll('.bar-chart-bar')
    const heights = Array.from(bars).map((bar) => Number(bar.getAttribute('height')))
    // Day index 5 (5000 cents) must be taller than day index 0 (1000 cents).
    expect(heights[5]).toBeGreaterThan(heights[0])
    // A zero-value day still renders a bar (height 0), not a missing element.
    expect(heights[1]).toBe(0)
  })

  it('renders without error when every day is zero', () => {
    const empty: DailySales[] = sevenDays.map((day) => ({ ...day, totalCents: 0 }))
    const { container } = render(<BarChart data={empty} />)
    expect(container.querySelectorAll('.bar-chart-bar')).toHaveLength(7)
  })

  it('labels each bar with its weekday, read from the local calendar date not UTC', () => {
    const { container } = render(<BarChart data={sevenDays} />)
    const labels = container.querySelectorAll('.bar-chart-label')
    expect(labels).toHaveLength(7)
    // 2026-09-03 is a Thursday — assert the last label matches whatever the
    // test environment's locale renders for that specific local date, by
    // comparing against a locally-constructed Date for the same y/m/d
    // (not `new Date('2026-09-03')`, which parses as UTC and can drift a
    // day in either direction depending on the runner's timezone).
    const expected = new Date(2026, 8, 3).toLocaleDateString(undefined, { weekday: 'short' })
    expect(labels[6].textContent).toBe(expected)
  })
})
