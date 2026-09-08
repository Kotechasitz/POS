import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductGrid from './ProductGrid'
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }
const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }

const coke: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Coke',
  priceCents: 2000,
  stock: 5,
  isActive: true,
  categoryId: '1',
  imagePath: null,
  createdAt: '',
  updatedAt: ''
}

const chips: ProductRecord = {
  id: '2',
  barcode: '222',
  name: 'Chips',
  priceCents: 3500,
  stock: 0,
  isActive: true,
  categoryId: '2',
  imagePath: 'abc.png',
  createdAt: '',
  updatedAt: ''
}

const inactiveProduct: ProductRecord = {
  id: '3',
  barcode: '333',
  name: 'Discontinued',
  priceCents: 1000,
  stock: 10,
  isActive: false,
  categoryId: null,
  imagePath: null,
  createdAt: '',
  updatedAt: ''
}

describe('ProductGrid', () => {
  it('renders a tile per active product with name and formatted price', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument()
    expect(screen.getByText('฿20.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chips/ })).toBeInTheDocument()
    expect(screen.getByText('฿35.00')).toBeInTheDocument()
  })

  it('does not render a tile for an inactive product', () => {
    render(
      <ProductGrid
        products={[coke, inactiveProduct]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Discontinued/ })).not.toBeInTheDocument()
  })

  it('renders an "All" pill plus one pill per category', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Beverages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snacks' })).toBeInTheDocument()
  })

  it('calls onSelectCategory with the category id when a pill is clicked, and with an empty string for "All"', async () => {
    const user = userEvent.setup()
    const onSelectCategory = vi.fn()
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={onSelectCategory}
        onSelectProduct={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Beverages' }))
    expect(onSelectCategory).toHaveBeenCalledWith('1')

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onSelectCategory).toHaveBeenCalledWith('')
  })

  it('only shows products in the selected category', () => {
    render(
      <ProductGrid
        products={[coke, chips]}
        categories={[beverages, snacks]}
        selectedCategoryId="1"
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chips/ })).not.toBeInTheDocument()
  })

  it('shows an empty message when the selected category has no products', () => {
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages, snacks]}
        selectedCategoryId="2"
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByText('No products in this category.')).toBeInTheDocument()
  })

  it('calls onSelectProduct with the product when an in-stock tile is clicked', async () => {
    const user = userEvent.setup()
    const onSelectProduct = vi.fn()
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={onSelectProduct}
      />
    )

    await user.click(screen.getByRole('button', { name: /Coke/ }))
    expect(onSelectProduct).toHaveBeenCalledWith(coke)
  })

  it('disables an out-of-stock tile and shows an out-of-stock label', () => {
    render(
      <ProductGrid
        products={[chips]}
        categories={[snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Chips/ })).toBeDisabled()
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
  })

  it('disables every tile when disabled is true', () => {
    render(
      <ProductGrid
        products={[coke]}
        categories={[beverages]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
        disabled
      />
    )

    expect(screen.getByRole('button', { name: /Coke/ })).toBeDisabled()
  })

  it("renders a product's image via the app-image:// protocol, or a placeholder when it has none", () => {
    render(
      <ProductGrid
        products={[chips, coke]}
        categories={[beverages, snacks]}
        selectedCategoryId=""
        onSelectCategory={vi.fn()}
        onSelectProduct={vi.fn()}
      />
    )

    expect(screen.getByAltText('Chips')).toHaveAttribute('src', 'app-image://abc.png')
    expect(screen.queryByAltText('Coke')).not.toBeInTheDocument()
  })
})
