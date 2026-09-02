import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useProducts } from './useProducts'
import type { ProductRecord } from '../../../../shared/product'

const sampleProduct: ProductRecord = {
  id: '1',
  barcode: '123',
  name: 'Water',
  priceCents: 1000,
  stock: 5,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

describe('useProducts', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([sampleProduct]),
        create: vi.fn(),
        update: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('loads products on mount', async () => {
    const { result } = renderHook(() => useProducts())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.products).toEqual([sampleProduct])
    expect(window.api.products.list).toHaveBeenCalledWith(undefined)
  })

  it('re-fetches with the query when setQuery is called', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setQuery('water')
    })

    await waitFor(() => expect(window.api.products.list).toHaveBeenLastCalledWith('water'))
  })

  it('surfaces an error message when the list call rejects', async () => {
    ;(window.api.products.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useProducts())

    await waitFor(() => expect(result.current.error).toBe('boom'))
  })

  it('createProduct calls the API and reloads the list', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.loading).toBe(false))
    ;(window.api.products.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleProduct)

    await act(async () => {
      await result.current.createProduct({
        barcode: '123',
        name: 'Water',
        priceCents: 1000,
        stock: 5
      })
    })

    expect(window.api.products.create).toHaveBeenCalledWith({
      barcode: '123',
      name: 'Water',
      priceCents: 1000,
      stock: 5
    })
    expect(window.api.products.list).toHaveBeenCalledTimes(2)
  })
})
