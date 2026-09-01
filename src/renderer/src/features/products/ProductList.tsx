import type { ProductRecord } from '../../../../shared/product'

export interface ProductListProps {
  products: ProductRecord[]
  onEdit: (product: ProductRecord) => void
}

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toFixed(2)}`
}

function ProductList({ products, onEdit }: ProductListProps): React.JSX.Element {
  if (products.length === 0) {
    return <p>No products found.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id}>
            <td>{product.barcode}</td>
            <td>{product.name}</td>
            <td>{formatBaht(product.priceCents)}</td>
            <td>{product.stock}</td>
            <td>{product.isActive ? 'Active' : 'Inactive'}</td>
            <td>
              <button type="button" onClick={() => onEdit(product)}>
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
