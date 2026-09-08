import { useEffect, useState } from 'react'
import type { SaleListItem } from '../../../../shared/salesHistory'

export interface VoidSaleModalProps {
  sale: SaleListItem
  submitting: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function VoidSaleModal({
  sale,
  submitting,
  error,
  onConfirm,
  onCancel
}: VoidSaleModalProps): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [step, setStep] = useState<'reason' | 'confirm'>('reason')

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

  function handleContinue(event: React.FormEvent): void {
    event.preventDefault()
    if (reason.trim().length === 0) {
      return
    }
    setStep('confirm')
  }

  function handleBack(): void {
    setStep('reason')
  }

  function handleConfirmVoid(): void {
    onConfirm(reason.trim())
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-sale-title"
      >
        <h2 id="void-sale-title">{`Void Sale #${sale.billNumber}`}</h2>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        {step === 'reason' ? (
          <form onSubmit={handleContinue}>
            <div className="field">
              <label htmlFor="void-reason">Reason</label>
              <textarea
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                autoFocus
              />
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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || reason.trim().length === 0}
              >
                Continue
              </button>
            </div>
          </form>
        ) : (
          <>
            <p>Are you sure you want to void this sale? This cannot be undone.</p>
            <p className="void-reason-preview">{`Reason: ${reason.trim()}`}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmVoid}
                disabled={submitting}
              >
                {submitting ? 'Voiding…' : 'Void Sale'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default VoidSaleModal
