import type { HeldCart } from './heldCartsStore'
import { Money } from '../../../../shared/money'
import { cartTotalCents } from './cartStore'

export interface HeldCartsModalProps {
  heldCarts: HeldCart[]
  error: string | null
  onResume: (id: string) => void
  onDiscard: (id: string) => void
  onClose: () => void
}

function HeldCartsModal({
  heldCarts,
  error,
  onResume,
  onDiscard,
  onClose
}: HeldCartsModalProps): React.JSX.Element {
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
        aria-labelledby="held-carts-title"
      >
        <h2 id="held-carts-title">Held Carts</h2>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        {heldCarts.length === 0 ? (
          <p>No held carts.</p>
        ) : (
          <ul className="held-carts-list">
            {heldCarts.map((held) => (
              <li key={held.id}>
                <div className="held-cart-info">
                  <span className="held-cart-label">{held.label ?? 'Untitled'}</span>
                  <span className="held-cart-meta">
                    {held.items.reduce((total, item) => total + item.quantity, 0)} item(s) —{' '}
                    {Money.fromCents(cartTotalCents(held.items)).format()}
                  </span>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => onResume(held.id)}>
                  Resume
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => onDiscard(held.id)}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default HeldCartsModal
