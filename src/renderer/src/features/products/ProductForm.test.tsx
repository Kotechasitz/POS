import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductForm from './ProductForm'
import type { ProductRecord } from '../../../../shared/product'

describe('ProductForm', () => {
  it('submits a valid new product with price converted to integer cents', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '8850001000012')
    await user.type(screen.getByLabelText('Name'), 'Coca Cola')
    await user.type(screen.getByLabelText('Price (Baht)'), '20.50')
    await user.type(screen.getByLabelText('Stock'), '10')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith({
      barcode: '8850001000012',
      name: 'Coca Cola',
      priceCents: 2050,
      stock: 10
    })
  })

  it('rejects submission with an empty name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '123')
    await user.type(screen.getByLabelText('Price (Baht)'), '5')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Product name is required')
  })

  it('rejects submission with an empty price', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '123')
    await user.type(screen.getByLabelText('Name'), 'A')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Price is required')
  })

  it('rejects a negative price', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductForm submitting={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Barcode'), '123')
    await user.type(screen.getByLabelText('Name'), 'A')
    await user.type(screen.getByLabelText('Price (Baht)'), '-5')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a non-negative number')
  })

  it('pre-fills fields and includes isActive when editing an existing product', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const existing: ProductRecord = {
      id: '1',
      barcode: '999',
      name: 'Chips',
      priceCents: 3500,
      stock: 20,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }

    render(
      <ProductForm
        initialValues={existing}
        submitting={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Barcode')).toHaveValue('999')
    expect(screen.getByLabelText('Name')).toHaveValue('Chips')

    await user.click(screen.getByLabelText('Active'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith({
      barcode: '999',
      name: 'Chips',
      priceCents: 3500,
      stock: 20,
      isActive: false
    })
  })

  it('shows a server-provided error when there is no local validation error', () => {
    render(
      <ProductForm
        submitting={false}
        error='A product with barcode "999" already exists'
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  })
})
