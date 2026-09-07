import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDashboard } from './useDashboard'
import type {
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const todayStats: DashboardStats = {
  current: { salesCents: 4000, orderCount: 2, unitsSold: 5, avgOrderValueCents: 2000 },
  previous: { salesCents: 2000, orderCount: 1, unitsSold: 2, avgOrderValueCents: 2000 }
}
const sevenDayStats: DashboardStats = {
  current: { salesCents: 9000, orderCount: 5, unitsSold: 12, avgOrderValueCents: 1800 },
  previous: { salesCents: 8000, orderCount: 4, unitsSold: 10, avgOrderValueCents: 2000 }
}
const hourlyChart: ChartBucket[] = [{ label: '9 AM', totalCents: 4000 }]
const sevenDayChart: ChartBucket[] = [{ label: 'Mon', totalCents: 9000 }]
const paymentBreakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 4000, count: 2 }
]
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const lowStock: ProductRecord[] = [
  {
    id: '1',
    barcode: '111',
    name: 'Coke',
    priceCents: 2000,
    stock: 1,
    isActive: true,
    categoryId: null,
    imagePath: null,
    createdAt: '',
    updatedAt: ''
  }
]

describe('useDashboard', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        stats: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? todayStats : sevenDayStats)
        ),
        chartData: vi.fn().mockImplementation((period: string) =>
          Promise.resolve(period === 'today' ? hourlyChart : sevenDayChart)
        ),
        paymentBreakdown: vi.fn().mockResolvedValue(paymentBreakdown),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn(), void: vi.fn(), exportCsv: vi.fn() }
    } as unknown as Window['api']
  })

  it("defaults to period 'today' and loads all five data sources", async () => {
    const { result } = renderHook(() => useDashboard())
    expect(result.current.periodLoading).toBe(true)
    expect(result.current.staticLoading).toBe(true)
    expect(result.current.period).toBe('today')

    await waitFor(() => expect(result.current.periodLoading).toBe(false))
    await waitFor(() => expect(result.current.staticLoading).toBe(false))
    expect(result.current.stats).toEqual(todayStats)
    expect(result.current.statsPeriod).toBe('today')
    expect(result.current.chartData).toEqual(hourlyChart)
    expect(result.current.paymentBreakdown).toEqual(paymentBreakdown)
    expect(result.current.topProducts).toEqual(topProducts)
    expect(result.current.lowStockProducts).toEqual(lowStock)
    expect(result.current.periodError).toBeNull()
    expect(result.current.staticError).toBeNull()
    // Called with the period AND a shared referenceDateIso string, so all
    // three period-scoped calls agree on "now".
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('today', expect.any(String))
    expect(window.api.dashboard.chartData).toHaveBeenCalledWith('today', expect.any(String))
    expect(window.api.dashboard.paymentBreakdown).toHaveBeenCalledWith('today', expect.any(String))
    const [statsPeriodArg, statsDateArg] = (
      window.api.dashboard.stats as ReturnType<typeof vi.fn>
    ).mock.calls[0]
    const [, chartDateArg] = (window.api.dashboard.chartData as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const [, breakdownDateArg] = (
      window.api.dashboard.paymentBreakdown as ReturnType<typeof vi.fn>
    ).mock.calls[0]
    expect(statsPeriodArg).toBe('today')
    expect(chartDateArg).toBe(statsDateArg)
    expect(breakdownDateArg).toBe(statsDateArg)
  })

  it('re-fetches stats, chart data, and payment breakdown when the period changes, without re-fetching top products or low stock', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.periodLoading).toBe(false))

    act(() => {
      result.current.setPeriod('7days')
    })
    await waitFor(() => expect(result.current.stats).toEqual(sevenDayStats))

    expect(result.current.period).toBe('7days')
    expect(result.current.statsPeriod).toBe('7days')
    expect(result.current.chartData).toEqual(sevenDayChart)
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('7days', expect.any(String))
    expect(window.api.dashboard.topProducts).toHaveBeenCalledTimes(1)
    expect(window.api.dashboard.lowStock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a clean period-error message when a period-scoped source fails', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:stats': Something broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.periodLoading).toBe(false))
    expect(result.current.periodError).toBe('Something broke')
  })

  it('does not let a successful period fetch clobber a static-effect error', async () => {
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:topProducts': Static source broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.periodLoading).toBe(false))
    await waitFor(() => expect(result.current.staticLoading).toBe(false))
    // The period effect (stats/chartData/paymentBreakdown) resolved successfully,
    // but the static effect's failure must still be reflected, not silently
    // cleared or masked by the period effect's own success.
    expect(result.current.staticError).toBe('Static source broke')
    expect(result.current.periodError).toBeNull()
    expect(result.current.topProducts).toEqual([])
    // The period side's success is untouched by the static side's failure.
    expect(result.current.stats).toEqual(todayStats)
  })

  it('does not let a static-effect success clobber a period-effect error, and vice versa (both errors surface independently)', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:stats': Period source broke")
    )
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:topProducts': Static source broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.periodLoading).toBe(false))
    await waitFor(() => expect(result.current.staticLoading).toBe(false))
    expect(result.current.periodError).toBe('Period source broke')
    expect(result.current.staticError).toBe('Static source broke')
  })

  it('does not overwrite stats/chartData/paymentBreakdown/statsPeriod when a period-switch fetch fails, so a consumer can detect the mismatch instead of showing stale data under the new label', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.stats).toEqual(todayStats))
    expect(result.current.statsPeriod).toBe('today')

    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:stats': switch failed")
    )
    act(() => {
      result.current.setPeriod('7days')
    })

    await waitFor(() => expect(result.current.periodError).toBe('switch failed'))
    // `period` has moved on to '7days', but the data/statsPeriod are left
    // exactly as they were — still 'today' — so a consumer comparing
    // statsPeriod to period can tell the data is stale rather than render
    // it under the new "Last 7 Days" heading.
    expect(result.current.period).toBe('7days')
    expect(result.current.statsPeriod).toBe('today')
    expect(result.current.stats).toEqual(todayStats)
  })

  it('keeps staticLoading true until the slower static effect also finishes, independently of periodLoading', async () => {
    let resolveTopProducts!: (value: TopProduct[]) => void
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<TopProduct[]>((resolve) => {
          resolveTopProducts = resolve
        })
    )

    const { result } = renderHook(() => useDashboard())

    // The period effect's data lands, but the static effect is still in flight.
    await waitFor(() => expect(result.current.stats).toEqual(todayStats))
    expect(result.current.periodLoading).toBe(false)
    expect(result.current.staticLoading).toBe(true)

    await act(async () => {
      resolveTopProducts(topProducts)
    })

    await waitFor(() => expect(result.current.staticLoading).toBe(false))
    expect(result.current.topProducts).toEqual(topProducts)
  })
})
