import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductsPage from './ProductsPage'
import type { ProductRecord } from '../../../../shared/product'

const existing: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Water',
  priceCents: 1000,
  stock: 5,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

describe('ProductsPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([existing]),
        create: vi.fn(),
        update: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('shows the product list once loaded', async () => {
    render(<ProductsPage />)

    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
  })

  it('creates a new product through the Add Product form', async () => {
    const user = userEvent.setup()
    const created: ProductRecord = { ...existing, id: '2', barcode: '222', name: 'Chips' }
    ;(window.api.products.create as ReturnType<typeof vi.fn>).mockResolvedValue(created)

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add Product' }))
    await user.type(screen.getByLabelText('Barcode'), '222')
    await user.type(screen.getByLabelText('Name'), 'Chips')
    await user.type(screen.getByLabelText('Price (Baht)'), '35')
    await user.type(screen.getByLabelText('Stock'), '20')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(window.api.products.create).toHaveBeenCalledWith({
        barcode: '222',
        name: 'Chips',
        priceCents: 3500,
        stock: 20
      })
    )
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('edits an existing product by clicking Edit and saving changes', async () => {
    const user = userEvent.setup()
    ;(window.api.products.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...existing,
      stock: 99
    })

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const stockInput = screen.getByLabelText('Stock')
    await user.clear(stockInput)
    await user.type(stockInput, '99')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(window.api.products.update).toHaveBeenCalledWith('1', {
        barcode: '111',
        name: 'Water',
        priceCents: 1000,
        stock: 99,
        isActive: true
      })
    )
  })

  it('filters via the search box, which re-queries window.api.products.list', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Search products'), 'wat')

    await waitFor(() => expect(window.api.products.list).toHaveBeenLastCalledWith('wat'))
  })
})
