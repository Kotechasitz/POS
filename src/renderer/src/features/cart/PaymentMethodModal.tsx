import { useEffect } from 'react'
import type { PaymentMethod } from '../../../../shared/sale'

export interface PaymentMethodModalProps {
  submitting: boolean
  onSelect: (method: PaymentMethod) => void
  onCancel: () => void
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'QR', label: 'QR' },
  { value: 'CARD', label: 'Card' }
]

function PaymentMethodModal({
  submitting,
  onSelect,
  onCancel
}: PaymentMethodModalProps): React.JSX.Element {
  // Same Escape-to-close convention as ProductForm/CategoryManager, guarded
  // against an in-flight sale so an accidental keypress can't abandon a
  // completeSale() call that's already been sent.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onCancel()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-method-title"
      >
        <h2 id="payment-method-title">Select Payment Method</h2>
        <div className="payment-method-options">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className="btn btn-primary payment-method-btn"
              onClick={() => onSelect(method.value)}
              disabled={submitting}
            >
              {method.label}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default PaymentMethodModal
