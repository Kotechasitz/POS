import { useEffect } from 'react'
import type { SaleRecord } from '../../../../shared/sale'
import { Money } from '../../../../shared/money'

export interface SaleDetailModalProps {
  sale: SaleRecord
  onClose: () => void
}

function SaleDetailModal({ sale, onClose }: SaleDetailModalProps): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-detail-title"
      >
        <h2 id="sale-detail-title">Sale Detail</h2>
        <p className="sale-detail-meta">{new Date(sale.createdAt).toLocaleString()}</p>

        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="col-price">Price</th>
              <th className="col-stock">Qty</th>
              <th className="col-price">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td className="cell-price">{Money.fromCents(item.priceCents).format()}</td>
                <td className="cell-stock">{item.quantity}</td>
                <td className="cell-price">{Money.fromCents(item.totalCents).format()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="sale-detail-total">Total: {Money.fromCents(sale.totalCents).format()}</p>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaleDetailModal
