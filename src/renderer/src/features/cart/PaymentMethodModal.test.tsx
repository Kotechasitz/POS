import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentMethodModal from './PaymentMethodModal'

describe('PaymentMethodModal', () => {
  it('renders a button for each payment method', () => {
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument()
  })

  it('calls onSelect with the chosen method', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={onSelect} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'QR' }))

    expect(onSelect).toHaveBeenCalledWith('QR')
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables every button and ignores Escape while submitting', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={true} onSelect={vi.fn()} onCancel={onCancel} />)

    expect(screen.getByRole('button', { name: 'Cash' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'QR' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Card' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('does not call onCancel when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<PaymentMethodModal submitting={false} onSelect={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
