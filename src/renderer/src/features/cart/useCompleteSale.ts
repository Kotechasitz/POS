import { useCallback, useState } from 'react'
import { useCartStore } from './cartStore'
import type { SaleLineInput, SaleRecord, PaymentMethod } from '../../../../shared/sale'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCompleteSaleResult {
  completing: boolean
  error: string | null
  completeSale: (paymentMethod: PaymentMethod) => Promise<SaleRecord | null>
  clearError: () => void
}

export function useCompleteSale(): UseCompleteSaleResult {
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeSale = useCallback(
    async (paymentMethod: PaymentMethod): Promise<SaleRecord | null> => {
      const items = useCartStore.getState().items
      if (items.length === 0) {
        return null
      }

      const lines: SaleLineInput[] = items.map((item) => ({
        productId: item.productId,
        productName: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity
      }))

      setCompleting(true)
      setError(null)
      try {
        // discountCents is always 0 here — Phase 9 adds the actual discount
        // input and threads a real value through this same call.
        const sale = await window.api.sales.complete(lines, paymentMethod, 0)
        useCartStore.getState().clear()
        return sale
      } catch (err) {
        setError(toUserMessage(err))
        return null
      } finally {
        setCompleting(false)
      }
    },
    []
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { completing, error, completeSale, clearError }
}
