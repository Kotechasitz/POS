import { useState } from 'react'
import type {
  CreateProductInput,
  ProductRecord,
  UpdateProductInput
} from '../../../../shared/product'

export interface ProductFormProps {
  initialValues?: ProductRecord
  submitting: boolean
  error: string | null
  onSubmit: (input: CreateProductInput | UpdateProductInput) => void
  onCancel: () => void
}

function ProductForm({
  initialValues,
  submitting,
  error,
  onSubmit,
  onCancel
}: ProductFormProps): React.JSX.Element {
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? '')
  const [name, setName] = useState(initialValues?.name ?? '')
  const [priceBaht, setPriceBaht] = useState(
    initialValues ? (initialValues.priceCents / 100).toString() : ''
  )
  const [stock, setStock] = useState(initialValues ? initialValues.stock.toString() : '')
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true)
  const [formError, setFormError] = useState<string | null>(null)

  const isEditing = initialValues !== undefined

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()

    if (barcode.trim().length === 0) {
      setFormError('Barcode is required')
      return
    }
    if (name.trim().length === 0) {
      setFormError('Product name is required')
      return
    }
    const priceCents = Math.round(Number(priceBaht) * 100)
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFormError('Price must be a non-negative number')
      return
    }
    const stockValue = Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      setFormError('Stock must be a non-negative whole number')
      return
    }

    setFormError(null)
    if (isEditing) {
      onSubmit({
        barcode: barcode.trim(),
        name: name.trim(),
        priceCents,
        stock: stockValue,
        isActive
      })
    } else {
      onSubmit({ barcode: barcode.trim(), name: name.trim(), priceCents, stock: stockValue })
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>{isEditing ? 'Edit Product' : 'Add Product'}</h2>

      <label htmlFor="product-barcode">Barcode</label>
      <input
        id="product-barcode"
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="product-name">Name</label>
      <input
        id="product-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="product-price">Price (Baht)</label>
      <input
        id="product-price"
        type="number"
        step="0.01"
        min="0"
        value={priceBaht}
        onChange={(e) => setPriceBaht(e.target.value)}
        disabled={submitting}
      />

      <label htmlFor="product-stock">Stock</label>
      <input
        id="product-stock"
        type="number"
        step="1"
        min="0"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        disabled={submitting}
      />

      {isEditing && (
        <label htmlFor="product-active">
          <input
            id="product-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={submitting}
          />
          Active
        </label>
      )}

      {(formError || error) && <p role="alert">{formError ?? error}</p>}

      <button type="submit" disabled={submitting}>
        {isEditing ? 'Save' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} disabled={submitting}>
        Cancel
      </button>
    </form>
  )
}

export default ProductForm
