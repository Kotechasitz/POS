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
  // Loading and error state are tracked separately per effect so that one
  // effect's success can't clobber the other's in-flight/failed state —
  // see Phase 11 Task 3 review findings 1 & 2.
  const [staticLoading, setStaticLoading] = useState(true)
  const [periodLoading, setPeriodLoading] = useState(true)
  const [staticError, setStaticError] = useState<string | null>(null)
  const [periodError, setPeriodError] = useState<string | null>(null)

  // Top products and low stock are period-independent (unchanged from
  // Phase 5) — loaded once, not re-fetched when `period` changes.
  useEffect(() => {
    let ignore = false

    async function loadStatic(): Promise<void> {
      setStaticLoading(true)
      try {
        const [topProductsResult, lowStockResult] = await Promise.all([
          window.api.dashboard.topProducts(),
          window.api.dashboard.lowStock()
        ])
        if (!ignore) {
          setTopProducts(topProductsResult)
          setLowStockProducts(lowStockResult)
          setStaticError(null)
        }
      } catch (err) {
        if (!ignore) {
          setStaticError(toUserMessage(err))
        }
      } finally {
        if (!ignore) {
          setStaticLoading(false)
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
      setPeriodLoading(true)
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
          setPeriodError(null)
        }
      } catch (err) {
        if (!ignore) {
          setPeriodError(toUserMessage(err))
        }
      } finally {
        if (!ignore) {
          setPeriodLoading(false)
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
    loading: staticLoading || periodLoading,
    error: staticError ?? periodError
  }
}
