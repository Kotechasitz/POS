import { useEffect, useState } from 'react'
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

  // Let the shop owner dismiss the dialog with Escape, matching how every
  // other dialog on their desktop behaves — but not mid-save, so an
  // in-flight create/update can't be abandoned by an accidental keypress.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onCancel()
    }
  }

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
    if (priceBaht.trim().length === 0) {
      setFormError('Price is required')
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
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
      >
        <form onSubmit={handleSubmit} noValidate>
          <h2 id="product-form-title">{isEditing ? 'Edit Product' : 'Add Product'}</h2>

          <div className="field">
            <label htmlFor="product-barcode">Barcode</label>
            <input
              id="product-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="product-name">Name</label>
            <input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field-row">
            <div className="field">
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
            </div>

            <div className="field">
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
            </div>
          </div>

          {isEditing && (
            <label className="checkbox-field" htmlFor="product-active">
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

          {(formError || error) && (
            <p role="alert" className="alert alert-danger">
              {formError ?? error}
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEditing ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProductForm
