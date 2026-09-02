import type { ProductRecord } from '../../../../shared/product'

export interface ProductListProps {
  products: ProductRecord[]
  onEdit: (product: ProductRecord) => void
  query?: string
}

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toFixed(2)}`
}

function EmptyIcon(): React.JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7l1.5-3.5A1 1 0 0 1 5.4 3h13.2a1 1 0 0 1 .9.6L21 7M3 7v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18M9 11a3 3 0 0 0 6 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProductList({ products, onEdit, query }: ProductListProps): React.JSX.Element {
  if (products.length === 0) {
    return (
      <div className="empty-state">
        <EmptyIcon />
        <h2>{query ? 'No matching products' : 'No products yet'}</h2>
        <p>
          {query
            ? `Nothing matches "${query}". Try a different barcode or name.`
            : 'Add your first product using the button above to get started.'}
        </p>
      </div>
    )
  }

  return (
    <table className="products-table">
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Name</th>
          <th className="col-price">Price</th>
          <th className="col-stock">Stock</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id} className={product.isActive ? undefined : 'is-inactive'}>
            <td className="cell-barcode">{product.barcode}</td>
            <td>{product.name}</td>
            <td className="cell-price">{formatBaht(product.priceCents)}</td>
            <td className="cell-stock">{product.stock}</td>
            <td>
              <span className={`badge ${product.isActive ? 'badge-active' : 'badge-inactive'}`}>
                {product.isActive ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className="cell-actions">
              <button type="button" className="btn btn-secondary" onClick={() => onEdit(product)}>
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default ProductList
