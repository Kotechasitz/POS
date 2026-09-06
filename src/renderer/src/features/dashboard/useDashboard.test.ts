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
    expect(result.current.loading).toBe(true)
    expect(result.current.period).toBe('today')

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats).toEqual(todayStats)
    expect(result.current.chartData).toEqual(hourlyChart)
    expect(result.current.paymentBreakdown).toEqual(paymentBreakdown)
    expect(result.current.topProducts).toEqual(topProducts)
    expect(result.current.lowStockProducts).toEqual(lowStock)
    expect(result.current.error).toBeNull()
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('today')
    expect(window.api.dashboard.chartData).toHaveBeenCalledWith('today')
    expect(window.api.dashboard.paymentBreakdown).toHaveBeenCalledWith('today')
  })

  it('re-fetches stats, chart data, and payment breakdown when the period changes, without re-fetching top products or low stock', async () => {
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setPeriod('7days')
    })
    await waitFor(() => expect(result.current.stats).toEqual(sevenDayStats))

    expect(result.current.period).toBe('7days')
    expect(result.current.chartData).toEqual(sevenDayChart)
    expect(window.api.dashboard.stats).toHaveBeenCalledWith('7days')
    expect(window.api.dashboard.topProducts).toHaveBeenCalledTimes(1)
    expect(window.api.dashboard.lowStock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a clean error message when a data source fails', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:stats': Something broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })
})
