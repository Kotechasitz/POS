import { useEffect } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import CartTable from './CartTable'
import { Money } from '../../../../shared/money'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown } = useBarcodeScan()

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
          onKeyDown={handleKeyDown}
          placeholder="Scan or type a barcode, then press Enter"
          autoComplete="off"
        />
      </div>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
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
          onClick={clear}
          disabled={items.length === 0}
        >
          Clear Cart
        </button>
      </div>
    </div>
  )
}

export default PosPage
