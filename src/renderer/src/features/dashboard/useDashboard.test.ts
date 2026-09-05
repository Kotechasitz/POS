import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDashboard } from './useDashboard'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const summary: DashboardSummary = { salesTodayCents: 4000, orderCountToday: 2, unitsSoldToday: 5 }
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const sevenDaySales: DailySales[] = [{ date: '2026-09-03', totalCents: 4000 }]
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
        summary: vi.fn().mockResolvedValue(summary),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        sevenDaySales: vi.fn().mockResolvedValue(sevenDaySales),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn() }
    } as unknown as Window['api']
  })

  it('starts in a loading state and then loads all four data sources', async () => {
    const { result } = renderHook(() => useDashboard())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(summary)
    expect(result.current.topProducts).toEqual(topProducts)
    expect(result.current.sevenDaySales).toEqual(sevenDaySales)
    expect(result.current.lowStockProducts).toEqual(lowStock)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message when a data source fails', async () => {
    ;(window.api.dashboard.summary as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'dashboard:summary': Something broke")
    )
    const { result } = renderHook(() => useDashboard())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })
})
