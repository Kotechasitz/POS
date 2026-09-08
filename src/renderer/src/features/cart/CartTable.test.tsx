import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CartTable from './CartTable'
import type { CartItem } from './cartStore'

const items: CartItem[] = [
  { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 },
  { productId: '2', barcode: '222', name: 'Water', unitPriceCents: 1000, stock: 1, quantity: 1 }
]

describe('CartTable', () => {
  it('shows an empty state when the cart has no items', () => {
    render(<CartTable items={[]} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Cart is empty')).toBeInTheDocument()
  })

  it('renders a row per cart item with formatted unit price and line total', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('Coke')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('฿40.00')).toBeInTheDocument()

    expect(screen.getByText('Water')).toBeInTheDocument()
    // Water's quantity is 1, so its unit price and line total are both ฿10.00 —
    // two distinct cells that happen to render the same text, not a bug.
    expect(screen.getAllByText('฿10.00')).toHaveLength(2)
  })

  it('calls onIncrement/onDecrement when the stepper buttons are clicked', async () => {
    const user = userEvent.setup()
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()
    render(
      <CartTable items={items} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={vi.fn()} />
    )

    await user.click(screen.getByLabelText('Increase quantity of Coke'))
    expect(onIncrement).toHaveBeenCalledWith('1')

    await user.click(screen.getByLabelText('Decrease quantity of Coke'))
    expect(onDecrement).toHaveBeenCalledWith('1')
  })

  it('disables the increment button once quantity reaches the known stock', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Increase quantity of Water')).toBeDisabled()
  })

  it('disables the decrement button at quantity 1', () => {
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Decrease quantity of Water')).toBeDisabled()
  })

  it('calls onRemove with the product id when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<CartTable items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={onRemove} />)

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(onRemove).toHaveBeenCalledWith('1')
  })

  it('disables every increment/decrement/remove button when disabled is true', () => {
    render(
      <CartTable
        items={items}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onRemove={vi.fn()}
        disabled
      />
    )

    expect(screen.getByLabelText('Increase quantity of Coke')).toBeDisabled()
    expect(screen.getByLabelText('Decrease quantity of Coke')).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeDisabled()
  })
})
