import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PosPage from './PosPage'
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

describe('PosPage', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn().mockResolvedValue(coke)
      }
    } as unknown as Window['api']
  })

  it('adds a scanned product to the cart and updates the total', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00')
  })

  it('increments the total when scanning the same barcode twice', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿40.00'))
  })

  it('shows an alert for an unknown barcode', async () => {
    const user = userEvent.setup()
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '999{Enter}')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Barcode not found: 999')
    )
  })

  it('clears the cart when Clear Cart is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Clear Cart' }))

    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('disables Clear Cart when the cart is empty', () => {
    render(<PosPage />)
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
  })

  it("reconciles a cart line's stock on mount, closing the stale-ceiling gap from switching tabs", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(useCartStore.getState().items[0].stock).toBe(5)

    // Simulate the product's real stock having been edited down elsewhere (e.g. the
    // Products tab) while this cart line still caches the old, higher value.
    ;(window.api.products.getByBarcode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...coke,
      stock: 1
    })

    // Simulate switching tabs away and back: App.tsx fully unmounts/remounts PosPage.
    unmount()
    render(<PosPage />)

    await waitFor(() => expect(useCartStore.getState().items[0].stock).toBe(1))
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })
})
