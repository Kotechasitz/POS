import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSalesHistory } from './useSalesHistory'
import type { SaleListItem } from '../../../../shared/salesHistory'

const list: SaleListItem[] = [
  { id: '1', billNumber: 1, totalCents: 4000, createdAt: '2026-09-03T10:00:00.000Z', itemCount: 2 }
]

describe('useSalesHistory', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn(),
        topProducts: vi.fn(),
        sevenDaySales: vi.fn(),
        lowStock: vi.fn()
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('loads the sales list on mount', async () => {
    const { result } = renderHook(() => useSalesHistory())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sales).toEqual(list)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message on failure', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'salesHistory:list': Something broke")
    )
    const { result } = renderHook(() => useSalesHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Something broke')
  })

  it('reload() re-fetches the list', async () => {
    const { result } = renderHook(() => useSalesHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updated: SaleListItem[] = [
      ...list,
      {
        id: '2',
        billNumber: 2,
        totalCents: 1000,
        createdAt: '2026-09-03T11:00:00.000Z',
        itemCount: 1
      }
    ]
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue(updated)

    await result.current.reload()

    await waitFor(() => expect(result.current.sales).toEqual(updated))
  })
})
