import { useState } from 'react'
import { useSalesHistory } from './useSalesHistory'
import SaleDetailModal from './SaleDetailModal'
import VoidSaleModal from './VoidSaleModal'
import { Money } from '../../../../shared/money'
import type { SaleRecord } from '../../../../shared/sale'
import { PAYMENT_METHODS } from '../../../../shared/sale'
import type { SaleListItem } from '../../../../shared/salesHistory'
import { toUserMessage } from '../../lib/ipcError'
import { formatDateTime } from '../../lib/formatDate'

function toLocalDay(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function SalesHistoryPage(): React.JSX.Element {
  const { sales, loading, error, reload } = useSalesHistory()
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [voidTarget, setVoidTarget] = useState<SaleListItem | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const filteredSales = sales.filter((sale) => {
    if (paymentFilter && sale.paymentMethod !== paymentFilter) {
      return false
    }
    if (statusFilter && sale.status !== statusFilter) {
      return false
    }
    // Compare by calendar day only, in local time — matching how the
    // date inputs themselves collect a plain YYYY-MM-DD with no time
    // component, not an exact instant.
    const saleDay = toLocalDay(sale.createdAt)
    if (fromDate && saleDay < fromDate) {
      return false
    }
    if (toDate && saleDay > toDate) {
      return false
    }
    return true
  })

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

  function handleVoidClick(sale: SaleListItem): void {
    setVoidError(null)
    setVoidTarget(sale)
  }

  function handleVoidCancel(): void {
    setVoidTarget(null)
  }

  async function handleVoidConfirm(reason: string): Promise<void> {
    if (!voidTarget) {
      return
    }
    setVoiding(true)
    try {
      await window.api.salesHistory.void(voidTarget.id, reason)
      setVoidTarget(null)
      setVoidError(null)
      await reload()
    } catch (err) {
      setVoidError(toUserMessage(err))
    } finally {
      setVoiding(false)
    }
  }

  async function handleExport(): Promise<void> {
    try {
      setExportError(null)
      await window.api.salesHistory.exportCsv(filteredSales)
    } catch (err) {
      setExportError(toUserMessage(err))
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Sales History</h1>
        <div className="sales-history-toolbar">
          <div className="field">
            <label htmlFor="sales-history-payment-filter">Filter by payment method</label>
            <select
              id="sales-history-payment-filter"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="">All</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sales-history-status-filter">Filter by status</label>
            <select
              id="sales-history-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="COMPLETED">Completed</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sales-history-from-date">From date</label>
            <input
              id="sales-history-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sales-history-to-date">To date</label>
            <input
              id="sales-history-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            Export
          </button>
        </div>
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
      {exportError && (
        <p role="alert" className="alert alert-danger">
          {exportError}
        </p>
      )}

      <div className="products-card">
        {loading ? (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" />
            Loading sales…
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="empty-state">
            <h2>{sales.length === 0 ? 'No sales yet' : 'No matching sales'}</h2>
            <p>
              {sales.length === 0
                ? 'Completed sales will show up here.'
                : 'Try widening the filters above.'}
            </p>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date &amp; Time</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th className="col-price">Total</th>
                <th className="col-stock">Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.billNumber}</td>
                  <td>{formatDateTime(sale.createdAt)}</td>
                  <td>{sale.paymentMethod}</td>
                  <td>
                    <span
                      className={`badge ${sale.status === 'VOID' ? 'badge-void' : 'badge-completed'}`}
                    >
                      {sale.status === 'VOID' ? 'Void' : 'Completed'}
                    </span>
                  </td>
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
                    {sale.status !== 'VOID' && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleVoidClick(sale)}
                      >
                        Void
                      </button>
                    )}
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

      {voidTarget && (
        <VoidSaleModal
          sale={voidTarget}
          submitting={voiding}
          error={voidError}
          onConfirm={handleVoidConfirm}
          onCancel={handleVoidCancel}
        />
      )}
    </div>
  )
}

export default SalesHistoryPage
