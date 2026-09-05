import { useEffect, useState } from 'react'

export interface HoldCartModalProps {
  onHold: (label: string) => void
  onCancel: () => void
}

function HoldCartModal({ onHold, onCancel }: HoldCartModalProps): React.JSX.Element {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    onHold(label)
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hold-cart-title"
      >
        <form onSubmit={handleSubmit}>
          <h2 id="hold-cart-title">Hold Cart</h2>
          <div className="field">
            <label htmlFor="hold-cart-label">Label (optional)</label>
            <input
              id="hold-cart-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Hold
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default HoldCartModal
