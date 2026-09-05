import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PosPage from './PosPage'
import { useCartStore } from './cartStore'
import { useHeldCartsStore } from './heldCartsStore'
import type { ProductRecord } from '../../../../shared/product'
import type { SaleRecord } from '../../../../shared/sale'

const coke: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 5,
  isActive: true,
  categoryId: null,
  imagePath: null,
  createdAt: '',
  updatedAt: ''
}

describe('PosPage', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    useHeldCartsStore.setState({ heldCarts: [] })
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([coke]),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn().mockResolvedValue(coke)
      },
      categories: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      sales: {
        complete: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('adds a scanned product to the cart and updates the total', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00')
  })

  it('increments the total when scanning the same barcode twice', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Clear Cart' }))

    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('disables Clear Cart and Finish Sale when the cart is empty', () => {
    render(<PosPage />)
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finish Sale' })).toBeDisabled()
  })

  it("reconciles a cart line's stock on mount, closing the stale-ceiling gap from switching tabs", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
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

  it('opens the payment method modal, then completes the sale, clears the cart, and shows a success message', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 4000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
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

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿40.00'))

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cash' }))

    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 2 }],
      'CASH',
      0
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('฿40.00')
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')
  })

  it('disables the barcode field while the payment method modal is open, so a scan cannot change the total mid-pick', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    expect(screen.getByLabelText('Barcode')).toBeDisabled()
  })

  it('closes the payment method modal without completing the sale when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.api.sales.complete).not.toHaveBeenCalled()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
  })

  it('shows an error and keeps the cart when the sale is rejected', async () => {
    const user = userEvent.setup()
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'sales:complete\': InsufficientStockError: Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not enough stock for "Coke": 1 available, 2 requested'
      )
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
  })

  it('clears a stale sale-rejection banner once a new item is scanned', async () => {
    const user = userEvent.setup()
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'sales:complete\': InsufficientStockError: Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not enough stock for "Coke": 1 available, 2 requested'
      )
    )

    // Scan a new, valid item — the stale sale-rejection banner must not linger
    // over this fresh cart state.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() =>
      expect(
        screen.queryByText('Not enough stock for "Coke": 1 available, 2 requested')
      ).not.toBeInTheDocument()
    )
  })

  it('hides a previous success message once a new item is scanned into a fresh sale', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 2000,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('renders a clickable product grid populated from the products list', async () => {
    render(<PosPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument())
  })

  it('clicking a product tile adds it to the cart, exactly like scanning its barcode', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Coke/ }))

    await waitFor(() => expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00'))
  })

  it('holds the current cart and clears it, via the Hold Cart modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Label (optional)'), 'Table 4')
    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (1)' })).toBeInTheDocument()
  })

  it('resumes a held cart into the (empty) active cart', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (0)' })).toBeInTheDocument()
  })

  it('rejects resuming a held cart while the active cart is not empty', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    // Hold one cart with Coke in it.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    // Start a new active cart.
    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(
      screen.getByText('Finish, clear, or hold your current cart before resuming a held one.')
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Held Carts (1)' })).toBeInTheDocument()
  })

  it('carries a discount into a held cart and restores it when the cart is resumed', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '5')

    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    expect(screen.getByLabelText('Discount (Baht)')).toHaveValue(null)

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(screen.getByLabelText('Discount (Baht)')).toHaveValue(5)
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿15.00')
  })

  it('discards a held cart', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Held Carts (1)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByText('No held carts.')).toBeInTheDocument()
  })

  it('shows a Subtotal row and reduces the Total by the entered discount', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    expect(screen.getByLabelText('Subtotal')).toHaveTextContent('฿20.00')
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿20.00')

    await user.type(screen.getByLabelText('Discount (Baht)'), '5')

    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿15.00')
  })

  it('rejects a discount larger than the subtotal without opening the payment method modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '999')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Discount cannot exceed the subtotal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows a discount exactly equal to the subtotal, opening the payment method modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '20')

    expect(screen.getByLabelText('Cart total')).toHaveTextContent('฿0.00')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a discount one satang over the subtotal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '20.01')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Discount cannot exceed the subtotal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the entered discount to completeSale when a payment method is picked', async () => {
    const user = userEvent.setup()
    const sale: SaleRecord = {
      id: 'sale-1',
      totalCents: 1500,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      discountCents: 500,
      createdAt: '2026-09-03T00:00:00.000Z',
      items: []
    }
    ;(window.api.sales.complete as ReturnType<typeof vi.fn>).mockResolvedValue(sale)

    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.type(screen.getByLabelText('Discount (Baht)'), '5')

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cash' }))

    expect(window.api.sales.complete).toHaveBeenCalledWith(
      [{ productId: '1', productName: 'Coke', unitPriceCents: 2000, quantity: 1 }],
      'CASH',
      500
    )
  })

  it('disables the discount field and every cart-editing control while the payment method modal is open', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    expect(screen.getByLabelText('Discount (Baht)')).toBeDisabled()
    // Anchored regex — plain /Coke/ would also match the stepper buttons'
    // "Increase/Decrease quantity of Coke" labels below, once the cart has
    // that item; the grid tile's accessible name is the only one that
    // starts with "Coke" (name span renders before the price span).
    expect(screen.getByRole('button', { name: /^Coke/ })).toBeDisabled()
    expect(screen.getByLabelText('Increase quantity of Coke')).toBeDisabled()
    expect(screen.getByLabelText('Decrease quantity of Coke')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear Cart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Held Carts (0)' })).toBeDisabled()
  })

  it('closes the Hold Cart modal without holding when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument()
  })

  it('pressing F12 opens the payment method modal, same as clicking Finish Sale', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())

    await user.keyboard('{F12}')

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('pressing F12 does nothing when the cart is empty', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.keyboard('{F12}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pressing F12 while the payment method modal is already open does not reopen or duplicate it', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Finish Sale' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{F12}')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('pressing F12 while the Hold Cart modal is open does not open the payment method modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{F12}')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cash' })).not.toBeInTheDocument()
  })

  it('pressing F12 while the Held Carts modal is open does not open the payment method modal', async () => {
    const user = userEvent.setup()
    render(<PosPage />)

    await user.type(screen.getByLabelText('Barcode'), '111{Enter}')
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Coke' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Held Carts (0)' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{F12}')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cash' })).not.toBeInTheDocument()
  })
})
