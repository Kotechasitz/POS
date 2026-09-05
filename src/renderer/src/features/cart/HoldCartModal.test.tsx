import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HoldCartModal from './HoldCartModal'

describe('HoldCartModal', () => {
  it('calls onHold with the typed label when the form is submitted', async () => {
    const user = userEvent.setup()
    const onHold = vi.fn()
    render(<HoldCartModal onHold={onHold} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Label (optional)'), 'Table 4')
    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(onHold).toHaveBeenCalledWith('Table 4')
  })

  it('calls onHold with an empty string when no label is typed', async () => {
    const user = userEvent.setup()
    const onHold = vi.fn()
    render(<HoldCartModal onHold={onHold} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Hold' }))

    expect(onHold).toHaveBeenCalledWith('')
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<HoldCartModal onHold={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })
})
