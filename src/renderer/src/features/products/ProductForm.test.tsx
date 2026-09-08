import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductForm from './ProductForm'
import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

describe('ProductForm', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn(),
        topProducts: vi.fn(),
        sevenDaySales: vi.fn(),
        lowStock: vi.fn()
      },
      salesHistory: { list: vi.fn(), detail: vi.fn() },
      images: { pickProductImage: vi.fn() }
    } as unknown as Window['api']
  })

  it('submits a valid new product with price converted to integer cents', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

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
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

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
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

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
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

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
      categoryId: null,
      imagePath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }

    render(
      <ProductForm
        initialValues={existing}
        submitting={false}
        error={null}
        categories={[]}
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
      isActive: false,
      categoryId: null
    })
  })

  it('shows a server-provided error when there is no local validation error', () => {
    render(
      <ProductForm
        submitting={false}
        error='A product with barcode "999" already exists'
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  })

  it('calls onCancel when the Escape key is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel on Escape while a submission is in flight', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ProductForm
        submitting={true}
        error={null}
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.keyboard('{Escape}')

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when the backdrop (outside the dialog panel) is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('dialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders as an accessible dialog labelled by its heading', () => {
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Add Product' })
    expect(dialog).toBeInTheDocument()
  })

  it('shows a category dropdown populated from the categories list', async () => {
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )
  })

  it('includes the selected categoryId when submitting a new product', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.selectOptions(screen.getByLabelText('Category'), 'Beverages')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: '1' }))
  })

  it('submits categoryId: undefined when no category is selected (the placeholder option)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: undefined }))
  })

  it('self-heals to "No category" if the selected category is deleted while the form is still open', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const existing: ProductRecord = {
      id: '1',
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10,
      isActive: true,
      categoryId: beverages.id,
      imagePath: null,
      createdAt: '',
      updatedAt: ''
    }

    const { rerender } = render(
      <ProductForm
        initialValues={existing}
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Category')).toHaveValue(beverages.id)

    // Simulate Beverages being deleted elsewhere (e.g. via Category Manager)
    // while this form is still open — ProductsPage passes the same live
    // `categories` array down to both.
    rerender(
      <ProductForm
        initialValues={existing}
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Category')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: null }))
  })

  it('picks an image and shows a preview', async () => {
    const user = userEvent.setup()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'C:\\fake\\picked-image.png',
      previewDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'Choose Image' }))

    await waitFor(() =>
      expect(screen.getByAltText('Product preview')).toHaveAttribute(
        'src',
        'data:image/png;base64,ZmFrZQ=='
      )
    )
  })

  it('includes the picked imageSourcePath when submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'C:\\fake\\picked-image.png',
      previewDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: 'Choose Image' }))
    await waitFor(() => expect(screen.getByAltText('Product preview')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Barcode'), '111')
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price (Baht)'), '20')
    await user.type(screen.getByLabelText('Stock'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ imageSourcePath: 'C:\\fake\\picked-image.png' })
    )
  })

  it('does nothing when the image picker is cancelled', async () => {
    const user = userEvent.setup()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'Choose Image' }))

    expect(screen.queryByAltText('Product preview')).not.toBeInTheDocument()
  })

  it('shows a clean error message when picking an image fails, instead of failing silently', async () => {
    const user = userEvent.setup()
    ;(window.api.images.pickProductImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        "Error invoking remote method 'images:pickProductImage': Could not read the selected image file. It may have moved or become unavailable — try picking it again."
      )
    )
    render(
      <ProductForm
        submitting={false}
        error={null}
        categories={[beverages]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Beverages' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'Choose Image' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not read the selected image file. It may have moved or become unavailable — try picking it again.'
      )
    )
    const alertText = screen.getByRole('alert').textContent ?? ''
    expect(alertText).not.toContain('Error invoking remote method')
    expect(screen.queryByAltText('Product preview')).not.toBeInTheDocument()
  })

  it('shows a Remove Image button when editing a product that already has an image, and removing it sends clearImage: true', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const withImage: ProductRecord = {
      id: '1',
      barcode: '111',
      name: 'Coke',
      priceCents: 2000,
      stock: 10,
      isActive: true,
      categoryId: null,
      imagePath: 'existing.png',
      createdAt: '',
      updatedAt: ''
    }
    render(
      <ProductForm
        initialValues={withImage}
        submitting={false}
        error={null}
        categories={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByAltText('Product preview')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Remove Image' }))
    expect(screen.queryByAltText('Product preview')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ clearImage: true }))
  })
})
