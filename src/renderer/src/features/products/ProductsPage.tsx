import { useState } from 'react'
import { useProducts } from './useProducts'
import ProductList from './ProductList'
import ProductForm from './ProductForm'
import { useCategories } from '../categories/useCategories'
import CategoryManager from '../categories/CategoryManager'
import type {
  CreateProductInput,
  ProductRecord,
  UpdateProductInput
} from '../../../../shared/product'

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProductsPage(): React.JSX.Element {
  const { products, loading, error, query, setQuery, createProduct, updateProduct } = useProducts()
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    createCategory,
    updateCategory,
    deleteCategory
  } = useCategories()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // If the category currently selected in the filter gets deleted (from the
  // Category Manager modal, which shares this same categories list), treat
  // the filter as cleared instead of leaving the dropdown pointed at an id
  // that no longer has a matching <option> — a dead-end filter that would
  // otherwise silently show "no products" with no visible cause. Derived at
  // render time rather than synced via an effect, so a deleted category's
  // id never needs to be written back into state.
  const effectiveCategoryFilter = categories.some((category) => category.id === categoryFilter)
    ? categoryFilter
    : ''

  const filteredProducts = effectiveCategoryFilter
    ? products.filter((product) => product.categoryId === effectiveCategoryFilter)
    : products
  const categoryFilterActive = effectiveCategoryFilter !== '' && products.length > 0

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
    <div className="products-page">
      <div className="products-header">
        <h1>Products</h1>
        <div className="products-toolbar">
          <div className="search-field">
            <SearchIcon />
            <input
              aria-label="Search products"
              placeholder="Search by barcode or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={handleAddClick}>
            Add Product
          </button>
          <select
            aria-label="Filter by category"
            value={effectiveCategoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCategoryManager(true)}
          >
            Manage Categories
          </button>
        </div>
      </div>

      <div className="products-card">
        {loading && (
          <div className="loading-row">
            <span className="spinner" />
            Loading products…
          </div>
        )}
        {error && (
          <p role="alert" className="alert alert-danger alert-inline">
            {error}
          </p>
        )}
        {!loading && !error && (
          <ProductList
            products={filteredProducts}
            onEdit={handleEdit}
            categories={categories}
            query={query}
            categoryFilterActive={categoryFilterActive}
          />
        )}
      </div>

      {showForm && (
        <ProductForm
          key={editingProduct?.id ?? 'new'}
          initialValues={editingProduct ?? undefined}
          submitting={submitting}
          error={formError}
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          loading={categoriesLoading}
          error={categoriesError}
          onCreate={createCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
          onClose={() => setShowCategoryManager(false)}
        />
      )}
    </div>
  )
}

export default ProductsPage
