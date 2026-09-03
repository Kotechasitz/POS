import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCompleteSale } from './useCompleteSale'
import { useCartStore } from './cartStore'
import type { SaleRecord } from '../../../../shared/sale'

const coke = { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 }

describe('useCompleteSale', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() }
    } as unknown as Window['api']
  })

  it('maps the cart to sale lines, completes the sale, and clears the cart', async () => {
    useCartStore.setState({ items: [coke] })
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          saleId: 'sale-1',
          productId: '1',
          productName: 'Coke',
          priceCents: 2000,
          quantity: 2,
          totalCents: 4000
        }
      ]
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    const { result } = renderHook(() => useCompleteSale())

    let returned: SaleRecord | null = null
    await act(async () => {
      returned = await result.current.completeSale()
    })

    expect(window.api.sales.complete).toHaveBeenCalledWith([
      { productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }
    ])
    expect(returned).toEqual(sale)
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('does nothing and returns null when the cart is empty', async () => {
    const { result } = renderHook(() => useCompleteSale())

    let returned: SaleRecord | null = null
    await act(async () => {
      returned = await result.current.completeSale()
    })

    expect(returned).toBeNull()
    expect(window.api.sales.complete).not.toHaveBeenCalled()
  })

  it('surfaces a clean error message and keeps the cart when the sale is rejected', async () => {
    useCartStore.setState({ items: [coke] })
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'sales:complete\': InsufficientStockError: Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    const { result } = renderHook(() => useCompleteSale())

    await act(async () => {
      await result.current.completeSale()
    })

    await waitFor(() =>
      expect(result.current.error).toBe('Not enough stock for "Coke": 1 available, 2 requested')
    )
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('sets completing to true while the call is in flight', async () => {
    useCartStore.setState({ items: [coke] })
    let resolveCall: (value: SaleRecord) => void = () => {}
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve
      })
    )

    const { result } = renderHook(() => useCompleteSale())

    let callPromise!: Promise<SaleRecord | null>
    act(() => {
      callPromise = result.current.completeSale()
    })

    await waitFor(() => expect(result.current.completing).toBe(true))

    resolveCall({
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    })
    await act(async () => {
      await callPromise
    })

    expect(result.current.completing).toBe(false)
  })
})
