import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductList from './ProductList'
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'

const products: ProductRecord[] = [
  {
    id: '1',
    barcode: '8850001000012',
    name: 'Coca Cola',
    priceCents: 2000,
    stock: 50,
    isActive: true,
    categoryId: null,
    imagePath: null,
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
    categoryId: null,
    imagePath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
]

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

const productWithCategory: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 10,
  isActive: true,
  categoryId: '1',
  imagePath: 'abc123.png',
  createdAt: '',
  updatedAt: ''
}

describe('ProductList', () => {
  it('renders a row per product with formatted price and status', () => {
    render(<ProductList products={products} onEdit={vi.fn()} categories={[]} />)

    expect(screen.getByText('Coca Cola')).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('฿10.00')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('shows a friendly empty state when there are no products and no search is active', () => {
    render(<ProductList products={[]} onEdit={vi.fn()} categories={[]} />)
    expect(screen.getByText('No products yet')).toBeInTheDocument()
  })

  it('shows a search-specific empty state when a query returns no matches', () => {
    render(<ProductList products={[]} onEdit={vi.fn()} categories={[]} query="xyz" />)
    expect(screen.getByText('No matching products')).toBeInTheDocument()
    expect(screen.getByText(/Nothing matches "xyz"/)).toBeInTheDocument()
  })

  it('calls onEdit with the product when its Edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<ProductList products={products} onEdit={onEdit} categories={[]} />)

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(onEdit).toHaveBeenCalledWith(products[0])
  })

  it('shows the category name for a product with a category assigned', () => {
    render(
      <ProductList products={[productWithCategory]} onEdit={vi.fn()} categories={[beverages]} />
    )
    expect(screen.getByText('Beverages')).toBeInTheDocument()
  })

  it('shows a dash for a product with no category', () => {
    const noCategory = { ...productWithCategory, categoryId: null }
    render(<ProductList products={[noCategory]} onEdit={vi.fn()} categories={[beverages]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it("renders a product's image via the app-image:// protocol", () => {
    render(
      <ProductList products={[productWithCategory]} onEdit={vi.fn()} categories={[beverages]} />
    )
    expect(screen.getByAltText('Coke')).toHaveAttribute('src', 'app-image://abc123.png')
  })

  it('renders a placeholder for a product with no image', () => {
    const noImage = { ...productWithCategory, imagePath: null }
    render(<ProductList products={[noImage]} onEdit={vi.fn()} categories={[beverages]} />)
    expect(screen.queryByAltText('Coke')).not.toBeInTheDocument()
  })
})
