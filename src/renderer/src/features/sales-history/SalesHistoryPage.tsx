import { useState } from 'react'
import { useSalesHistory } from './useSalesHistory'
import SaleDetailModal from './SaleDetailModal'
import { Money } from '../../../../shared/money'
import type { SaleRecord } from '../../../../shared/sale'
import { toUserMessage } from '../../lib/ipcError'
import { formatDateTime } from '../../lib/formatDate'

function SalesHistoryPage(): React.JSX.Element {
  const { sales, loading, error } = useSalesHistory()
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function handleView(saleId: string): Promise<void> {
    try {
      const found = await window.api.salesHistory.detail(saleId)
      if (found) {
        setSelectedSale(found)
        setDetailError(null)
      } else {
        setDetailError(`Sale ${saleId} was not found`)
      }
    } catch (err) {
      setDetailError(toUserMessage(err))
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Sales History</h1>
      </div>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {detailError && (
        <p role="alert" className="alert alert-danger">
          {detailError}
        </p>
      )}

      <div className="products-card">
        {loading ? (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" />
            Loading sales…
          </div>
        ) : sales.length === 0 ? (
          <div className="empty-state">
            <h2>No sales yet</h2>
            <p>Completed sales will show up here.</p>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date &amp; Time</th>
                <th className="col-price">Total</th>
                <th className="col-stock">Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.billNumber}</td>
                  <td>{formatDateTime(sale.createdAt)}</td>
                  <td className="cell-price">{Money.fromCents(sale.totalCents).format()}</td>
                  <td className="cell-stock">{sale.itemCount}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleView(sale.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  )
}

export default SalesHistoryPage
