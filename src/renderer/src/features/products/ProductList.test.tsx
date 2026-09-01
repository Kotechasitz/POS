import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductList from './ProductList'
import type { ProductRecord } from '../../../../shared/product'

const products: ProductRecord[] = [
  {
    id: '1',
    barcode: '8850001000012',
    name: 'Coca Cola',
    priceCents: 2000,
    stock: 50,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: '2',
    barcode: '8850002000013',
    name: 'Water',
    priceCents: 1000,
    stock: 0,
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
]

describe('ProductList', () => {
  it('renders a row per product with formatted price and status', () => {
    render(<ProductList products={products} onEdit={vi.fn()} />)

    expect(screen.getByText('Coca Cola')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('฿10.00')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('shows an empty state when there are no products', () => {
    render(<ProductList products={[]} onEdit={vi.fn()} />)
    expect(screen.getByText('No products found.')).toBeInTheDocument()
  })

  it('calls onEdit with the product when its Edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<ProductList products={products} onEdit={onEdit} />)

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(onEdit).toHaveBeenCalledWith(products[0])
  })
})
