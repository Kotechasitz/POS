import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaleDetailModal from './SaleDetailModal'
import type { SaleRecord } from '../../../../shared/sale'

const sale: SaleRecord = {
  id: 'sale-1',
  totalCents: 6000,
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  discountCents: 0,
  createdAt: '2026-09-03T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      saleId: 'sale-1',
      productId: '1',
      productName: 'Coke',
      priceCents: 2000,
      quantity: 3,
      totalCents: 6000
    }
  ]
}

describe('SaleDetailModal', () => {
  it('renders the line items and the total', () => {
    render(<SaleDetailModal sale={sale} onClose={vi.fn()} />)

    expect(screen.getByText('Coke')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Total: ฿60.00')).toBeInTheDocument()
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the backdrop (outside the dialog panel) is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SaleDetailModal sale={sale} onClose={onClose} />)

    await user.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
