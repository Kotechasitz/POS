import type { ProductRecord } from '../../../../shared/product'
import type { CategoryRecord } from '../../../../shared/category'
import { Money } from '../../../../shared/money'

export interface ProductGridProps {
  products: ProductRecord[]
  categories: CategoryRecord[]
  selectedCategoryId: string
  onSelectCategory: (categoryId: string) => void
  onSelectProduct: (product: ProductRecord) => void
  disabled?: boolean
}

function ProductGrid({
  products,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onSelectProduct,
  disabled
}: ProductGridProps): React.JSX.Element {
  const activeProducts = products.filter((product) => product.isActive)
  const visibleProducts = selectedCategoryId
    ? activeProducts.filter((product) => product.categoryId === selectedCategoryId)
    : activeProducts

  return (
    <div className="product-grid-panel">
      <div className="category-pills" role="tablist" aria-label="Filter products by category">
        <button
          type="button"
          className={`category-pill${selectedCategoryId === '' ? ' is-active' : ''}`}
          onClick={() => onSelectCategory('')}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`category-pill${selectedCategoryId === category.id ? ' is-active' : ''}`}
            onClick={() => onSelectCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {visibleProducts.length === 0 ? (
        <p className="product-grid-empty">No products in this category.</p>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              className="product-tile"
              onClick={() => onSelectProduct(product)}
              disabled={disabled || product.stock < 1}
            >
              {product.imagePath ? (
                <img
                  src={`app-image://${product.imagePath}`}
                  alt={product.name}
                  className="product-tile-image"
                />
              ) : (
                <span className="product-tile-image-placeholder" aria-hidden="true" />
              )}
              <span className="product-tile-name">{product.name}</span>
              <span className="product-tile-price">
                {Money.fromCents(product.priceCents).format()}
              </span>
              {product.stock < 1 && <span className="product-tile-out-of-stock">Out of stock</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProductGrid
