import { useState } from 'react'
import { useProducts } from './useProducts'
import ProductList from './ProductList'
import ProductForm from './ProductForm'
import type {
  CreateProductInput,
  ProductRecord,
  UpdateProductInput
} from '../../../../shared/product'

function ProductsPage(): React.JSX.Element {
  const { products, loading, error, query, setQuery, createProduct, updateProduct } = useProducts()
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function handleAddClick(): void {
    setEditingProduct(null)
    setFormError(null)
    setShowForm(true)
  }

  function handleEdit(product: ProductRecord): void {
    setEditingProduct(product)
    setFormError(null)
    setShowForm(true)
  }

  function handleCancel(): void {
    setShowForm(false)
  }

  async function handleSubmit(input: CreateProductInput | UpdateProductInput): Promise<void> {
    setSubmitting(true)
    setFormError(null)
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, input as UpdateProductInput)
      } else {
        await createProduct(input as CreateProductInput)
      }
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>Products</h1>

      <input
        aria-label="Search products"
        placeholder="Search by barcode or name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="button" onClick={handleAddClick}>
        Add Product
      </button>

      {loading && <p>Loading products...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && <ProductList products={products} onEdit={handleEdit} />}

      {showForm && (
        <ProductForm
          key={editingProduct?.id ?? 'new'}
          initialValues={editingProduct ?? undefined}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

export default ProductsPage
