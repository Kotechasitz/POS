import { useEffect, useState } from 'react'
import type {
  DashboardPeriod,
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'
import { toUserMessage } from '../../lib/ipcError'

export interface UseDashboardResult {
  period: DashboardPeriod
  setPeriod: (period: DashboardPeriod) => void
  stats: DashboardStats | null
  chartData: ChartBucket[]
  paymentBreakdown: PaymentMethodBreakdown[]
  topProducts: TopProduct[]
  lowStockProducts: ProductRecord[]
  loading: boolean
  error: string | null
}

export function useDashboard(): UseDashboardResult {
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartBucket[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdown[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Top products and low stock are period-independent (unchanged from
  // Phase 5) — loaded once, not re-fetched when `period` changes.
  useEffect(() => {
    let ignore = false

    async function loadStatic(): Promise<void> {
      try {
        const [topProductsResult, lowStockResult] = await Promise.all([
          window.api.dashboard.topProducts(),
          window.api.dashboard.lowStock()
        ])
        if (!ignore) {
          setTopProducts(topProductsResult)
          setLowStockProducts(lowStockResult)
        }
      } catch (err) {
        if (!ignore) {
          setError(toUserMessage(err))
        }
      }
    }

    loadStatic()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadPeriod(): Promise<void> {
      setLoading(true)
      try {
        const [statsResult, chartDataResult, paymentBreakdownResult] = await Promise.all([
          window.api.dashboard.stats(period),
          window.api.dashboard.chartData(period),
          window.api.dashboard.paymentBreakdown(period)
        ])
        if (!ignore) {
          setStats(statsResult)
          setChartData(chartDataResult)
          setPaymentBreakdown(paymentBreakdownResult)
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

    loadPeriod()
    return () => {
      ignore = true
    }
  }, [period])

  return {
    period,
    setPeriod,
    stats,
    chartData,
    paymentBreakdown,
    topProducts,
    lowStockProducts,
    loading,
    error
  }
}
