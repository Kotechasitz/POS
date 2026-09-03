import { useCallback, useEffect, useState } from 'react'
import type { SaleListItem } from '../../../../shared/salesHistory'
import { toUserMessage } from '../../lib/ipcError'

export interface UseSalesHistoryResult {
  sales: SaleListItem[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useSalesHistory(): UseSalesHistoryResult {
  const [sales, setSales] = useState<SaleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.salesHistory.list()
      setSales(result)
      setError(null)
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  return { sales, loading, error, reload }
}
