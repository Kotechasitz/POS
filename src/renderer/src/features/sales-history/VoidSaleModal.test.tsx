import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoidSaleModal from './VoidSaleModal'
import type { SaleListItem } from '../../../../shared/salesHistory'

const sale: SaleListItem = {
  id: 'sale-1',
  billNumber: 7,
  totalCents: 4000,
  createdAt: '2026-09-06T10:00:00.000Z',
  itemCount: 2,
  status: 'COMPLETED',
  paymentMethod: 'CASH'
}

describe('VoidSaleModal', () => {
  it('shows the bill number in the title', () => {
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('heading', { name: 'Void Sale #7' })).toBeInTheDocument()
  })

  it('disables Continue until a reason is typed', async () => {
    const user = userEvent.setup()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.type(screen.getByLabelText('Reason'), 'Customer changed their mind')

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
  })

  it('does not call onConfirm directly from the reason step — Continue only advances to the confirm step', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Void Sale' })).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
  })

  it('calls onConfirm with the trimmed reason only after the explicit confirm step', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('Reason'), '  Wrong order  ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    expect(onConfirm).toHaveBeenCalledWith('Wrong order')
  })

  it('Back returns to the reason step without losing the typed reason', async () => {
    const user = userEvent.setup()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByLabelText('Reason')).toHaveValue('Wrong order')
  })

  it('calls onCancel from the reason step', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows an error message when one is given', async () => {
    const user = userEvent.setup()
    render(
      <VoidSaleModal
        sale={sale}
        submitting={false}
        error={'Sale "sale-1" has already been voided'}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('alert')).toHaveTextContent('already been voided')
  })

  it('disables the reason field and buttons while submitting', () => {
    render(
      <VoidSaleModal
        sale={sale}
        submitting={true}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Reason')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
