import { useEffect, useState } from 'react'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'
import { toUserMessage } from '../../lib/ipcError'

export interface UseDashboardResult {
  summary: DashboardSummary | null
  topProducts: TopProduct[]
  sevenDaySales: DailySales[]
  lowStockProducts: ProductRecord[]
  loading: boolean
  error: string | null
}

export function useDashboard(): UseDashboardResult {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [sevenDaySales, setSevenDaySales] = useState<DailySales[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [summaryResult, topProductsResult, sevenDaySalesResult, lowStockResult] =
          await Promise.all([
            window.api.dashboard.summary(),
            window.api.dashboard.topProducts(),
            window.api.dashboard.sevenDaySales(),
            window.api.dashboard.lowStock()
          ])
        if (!ignore) {
          setSummary(summaryResult)
          setTopProducts(topProductsResult)
          setSevenDaySales(sevenDaySalesResult)
          setLowStockProducts(lowStockResult)
          setError(null)
        }
      } catch (err) {
        if (!ignore) {
          setError(toUserMessage(err))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  return { summary, topProducts, sevenDaySales, lowStockProducts, loading, error }
}
