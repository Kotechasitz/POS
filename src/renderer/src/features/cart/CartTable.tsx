import { Money } from '../../../../shared/money'
import { lineTotalCents, type CartItem } from './cartStore'

export interface CartTableProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
  disabled?: boolean
}

function CartIcon(): React.JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="21" r="1.4" fill="currentColor" />
      <circle cx="17" cy="21" r="1.4" fill="currentColor" />
    </svg>
  )
}

function CartTable({
  items,
  onIncrement,
  onDecrement,
  onRemove,
  disabled
}: CartTableProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <CartIcon />
        <h2>Cart is empty</h2>
        <p>Scan a product&apos;s barcode to add it to the sale.</p>
      </div>
    )
  }

  return (
    <table className="products-table">
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Product</th>
          <th className="col-price">Unit Price</th>
          <th className="col-stock">Qty</th>
          <th className="col-price">Line Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.productId}>
            <td className="cell-barcode">{item.barcode}</td>
            <td>{item.name}</td>
            <td className="cell-price">{Money.fromCents(item.unitPriceCents).format()}</td>
            <td className="cell-stock">
              <div className="qty-stepper">
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => onDecrement(item.productId)}
                  disabled={disabled || item.quantity <= 1}
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => onIncrement(item.productId)}
                  disabled={disabled || item.quantity >= item.stock}
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  +
                </button>
              </div>
            </td>
            <td className="cell-price">{Money.fromCents(lineTotalCents(item)).format()}</td>
            <td className="cell-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onRemove(item.productId)}
                disabled={disabled}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default CartTable
