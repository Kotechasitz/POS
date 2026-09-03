import { useEffect, useState } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import { useCompleteSale } from './useCompleteSale'
import CartTable from './CartTable'
import { Money } from '../../../../shared/money'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown, clearError } = useBarcodeScan()
  const {
    completing,
    error: saleError,
    completeSale,
    clearError: clearSaleError
  } = useCompleteSale()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function reconcileStock(): Promise<void> {
      const currentItems = useCartStore.getState().items
      for (const item of currentItems) {
        const fresh = await window.api.products.getByBarcode(item.barcode)
        if (!cancelled && fresh) {
          useCartStore.getState().syncStock(item.productId, fresh.stock)
        }
      }
    }

    reconcileStock()

    return () => {
      cancelled = true
    }
  }, [])

  function handleBarcodeKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && value.trim().length > 0) {
      if (successMessage) {
        setSuccessMessage(null)
      }
      if (error) {
        clearError()
      }
      if (saleError) {
        clearSaleError()
      }
    }
    handleKeyDown(event)
  }

  function handleClearCart(): void {
    clear()
    clearSaleError()
  }

  async function handleFinishSale(): Promise<void> {
    const sale = await completeSale()
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>POS</h1>
        <div className="pos-total" aria-label="Cart total">
          {Money.fromCents(cartTotalCents(items)).format()}
        </div>
      </div>

      <div className="scan-field">
        <label htmlFor="barcode-scan">Barcode</label>
        <input
          id="barcode-scan"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleBarcodeKeyDown}
          placeholder="Scan or type a barcode, then press Enter"
          autoComplete="off"
        />
      </div>

      {(error || saleError) && !successMessage && (
        <p role="alert" className="alert alert-danger">
          {error ?? saleError}
        </p>
      )}

      {successMessage && (
        <p role="status" className="alert alert-success">
          {successMessage}
        </p>
      )}

      <div className="products-card">
        <CartTable
          items={items}
          onIncrement={incrementItem}
          onDecrement={decrementItem}
          onRemove={removeItem}
        />
      </div>

      <div className="pos-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleClearCart}
          disabled={items.length === 0 || completing}
        >
          Clear Cart
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFinishSale}
          disabled={items.length === 0 || completing}
        >
          {completing ? 'Completing…' : 'Finish Sale'}
        </button>
      </div>
    </div>
  )
}

export default PosPage
