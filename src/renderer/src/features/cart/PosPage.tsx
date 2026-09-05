import { useEffect, useState } from 'react'
import { useCartStore, cartTotalCents } from './cartStore'
import { useBarcodeScan } from './useBarcodeScan'
import { useCompleteSale } from './useCompleteSale'
import CartTable from './CartTable'
import ProductGrid from './ProductGrid'
import PaymentMethodModal from './PaymentMethodModal'
import { useProducts } from '../products/useProducts'
import { useCategories } from '../categories/useCategories'
import { Money } from '../../../../shared/money'
import type { PaymentMethod } from '../../../../shared/sale'
import type { ProductRecord } from '../../../../shared/product'

function PosPage(): React.JSX.Element {
  const items = useCartStore((state) => state.items)
  const incrementItem = useCartStore((state) => state.incrementItem)
  const decrementItem = useCartStore((state) => state.decrementItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const clear = useCartStore((state) => state.clear)
  const { inputRef, value, setValue, error, handleKeyDown, scan, clearError } = useBarcodeScan()
  const { products } = useProducts()
  const { categories } = useCategories()
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const {
    completing,
    error: saleError,
    completeSale,
    clearError: clearSaleError
  } = useCompleteSale()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

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

  function handleFinishSaleClick(): void {
    setShowPaymentModal(true)
  }

  async function handleSelectProductTile(product: ProductRecord): Promise<void> {
    await scan(product.barcode)
  }

  async function handleSelectPaymentMethod(method: PaymentMethod): Promise<void> {
    const sale = await completeSale(method)
    setShowPaymentModal(false)
    if (sale) {
      setSuccessMessage(`Sale completed — ${Money.fromCents(sale.totalCents).format()}`)
    }
  }

  function handleCancelPaymentModal(): void {
    setShowPaymentModal(false)
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
          disabled={showPaymentModal}
        />
      </div>

      <ProductGrid
        products={products}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectProduct={handleSelectProductTile}
      />

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
          onClick={handleFinishSaleClick}
          disabled={items.length === 0 || completing}
        >
          {completing ? 'Completing…' : 'Finish Sale'}
        </button>
      </div>

      {showPaymentModal && (
        <PaymentMethodModal
          submitting={completing}
          onSelect={handleSelectPaymentMethod}
          onCancel={handleCancelPaymentModal}
        />
      )}
    </div>
  )
}

export default PosPage
