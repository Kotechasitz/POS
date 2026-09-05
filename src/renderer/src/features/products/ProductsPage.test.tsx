import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductsPage from './ProductsPage'
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

const existing: ProductRecord = {
  id: '1',
  barcode: '111',
  name: 'Water',
  priceCents: 1000,
  stock: 5,
  isActive: true,
  categoryId: null,
  imagePath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const secondExisting: ProductRecord = {
  id: '2',
  barcode: '222',
  name: 'Chips',
  priceCents: 3500,
  stock: 20,
  isActive: true,
  categoryId: null,
  imagePath: null,
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
      },
      categories: {
        list: vi.fn().mockResolvedValue([beverages]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      images: { pickProductImage: vi.fn() }
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

  it('shows a clean error message when create is rejected with a duplicate barcode, stripping Electron IPC wrapping', async () => {
    const user = userEvent.setup()
    // Mirrors the real message shape produced when a listener registered via
    // ipcMain.handle throws: Electron's ipcRenderer.invoke wraps it as
    // `Error invoking remote method '<channel>': <ErrorName>: <message>`.
    ;(window.api.products.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        `Error invoking remote method 'products:create': DuplicateBarcodeError: A product with barcode "999" already exists`
      )
    )

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add Product' }))
    await user.type(screen.getByLabelText('Barcode'), '999')
    await user.type(screen.getByLabelText('Name'), 'Dup')
    await user.type(screen.getByLabelText('Price (Baht)'), '10')
    await user.type(screen.getByLabelText('Stock'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A product with barcode "999" already exists'
      )
    )
    const alertText = screen.getByRole('alert').textContent ?? ''
    expect(alertText).not.toContain('Error invoking remote method')
    expect(alertText).not.toContain('DuplicateBarcodeError')
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
        isActive: true,
        categoryId: null
      })
    )
  })

  it('resets the form fields when switching from Add mode to editing a different product', async () => {
    const user = userEvent.setup()
    ;(window.api.products.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      existing,
      secondExisting
    ])

    render(<ProductsPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Chips')).toBeInTheDocument())

    // Open the Add form and type some half-finished values into it.
    await user.click(screen.getByRole('button', { name: 'Add Product' }))
    await user.type(screen.getByLabelText('Barcode'), '999999')
    await user.type(screen.getByLabelText('Name'), 'Half Typed Junk')

    // Without cancelling, click Edit on the "Chips" row.
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButtons[1])

    // The form must now show Chips' actual values, not the stale typed-in ones.
    await waitFor(() => expect(screen.getByLabelText('Barcode')).toHaveValue('222'))
    expect(screen.getByLabelText('Name')).toHaveValue('Chips')

    // Saving must update the correct record (Chips' id), not overwrite it with junk.
    ;(window.api.products.update as ReturnType<typeof vi.fn>).mockResolvedValue(secondExisting)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(window.api.products.update).toHaveBeenCalledWith('2', {
        barcode: '222',
        name: 'Chips',
        priceCents: 3500,
        stock: 20,
        isActive: true,
        categoryId: null
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

  it('shows a category filter dropdown populated from the categories list', async () => {
    render(<ProductsPage />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )
  })

  it('opens the Category Manager modal', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Manage Categories' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'Manage Categories' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Manage Categories' })).toBeInTheDocument()
  })

  it('closes the Category Manager modal', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await user.click(screen.getByRole('button', { name: 'Manage Categories' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
