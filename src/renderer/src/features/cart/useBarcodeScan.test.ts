import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useBarcodeScan } from './useBarcodeScan'
import { useCartStore } from './cartStore'
import type { ProductRecord } from '../../../../shared/product'

const coke: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 5,
  isActive: true,
  createdAt: '',
  updatedAt: ''
}

function pressEnter(
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
): Promise<void> {
  return act(async () => {
    handleKeyDown({ key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent<HTMLInputElement>)
  })
}

describe('useBarcodeScan', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('adds the scanned product to the cart on Enter and clears the field', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(coke)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
    expect(result.current.value).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('shows an error and does not touch the cart when the barcode is unknown', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('999'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Barcode not found: 999'))
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('shows an error for a deactivated product without adding it', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...coke,
      isActive: false
    })
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Coke is not available for sale'))
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('shows a stock error when scanning beyond available stock', async () => {
    const scarce = { ...coke, stock: 1 }
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(scarce)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)
    act(() => result.current.setValue('111'))
    await pressEnter(result.current.handleKeyDown)

    await waitFor(() => expect(result.current.error).toBe('Not enough stock for Coke'))
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('ignores Enter on an empty field', async () => {
    const { result } = renderHook(() => useBarcodeScan())

    await pressEnter(result.current.handleKeyDown)

    expect(window.api.products.getByBarcode).not.toHaveBeenCalled()
  })

  it('clears the error via clearError', async () => {
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const { result } = renderHook(() => useBarcodeScan())

    act(() => result.current.setValue('999'))
    await pressEnter(result.current.handleKeyDown)
    await waitFor(() => expect(result.current.error).toBe('Barcode not found: 999'))

    act(() => result.current.clearError())

    expect(result.current.error).toBeNull()
  })
})
