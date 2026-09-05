import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HeldCartsModal from './HeldCartsModal'
import type { HeldCart } from './heldCartsStore'

const held: HeldCart = {
  id: 'held-1',
  label: 'Table 4',
  items: [
    { productId: '1', barcode: '111', name: 'Coke', unitPriceCents: 2000, stock: 5, quantity: 2 }
  ],
  heldAt: '2026-09-05T10:00:00.000Z'
}

const untitledHeld: HeldCart = {
  id: 'held-2',
  label: null,
  items: [],
  heldAt: '2026-09-05T10:05:00.000Z'
}

describe('HeldCartsModal', () => {
  it('shows a message when there are no held carts', () => {
    render(
      <HeldCartsModal heldCarts={[]} error={null} onResume={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('No held carts.')).toBeInTheDocument()
  })

  it("shows each held cart's label, item count, and total", () => {
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText(/2 item\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/฿40\.00/)).toBeInTheDocument()
  })

  it('shows "Untitled" for a held cart with no label', () => {
    render(
      <HeldCartsModal
        heldCarts={[untitledHeld]}
        error={null}
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onResume with the held cart id when Resume is clicked', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={onResume}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResume).toHaveBeenCalledWith('held-1')
  })

  it('calls onDiscard with the held cart id when Discard is clicked', async () => {
    const user = userEvent.setup()
    const onDiscard = vi.fn()
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error={null}
        onResume={vi.fn()}
        onDiscard={onDiscard}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledWith('held-1')
  })

  it('shows an error message when one is given', () => {
    render(
      <HeldCartsModal
        heldCarts={[held]}
        error="Finish, clear, or hold your current cart before resuming a held one."
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish, clear, or hold your current cart before resuming a held one.'
    )
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <HeldCartsModal heldCarts={[]} error={null} onResume={vi.fn()} onDiscard={vi.fn()} onClose={onClose} />
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
