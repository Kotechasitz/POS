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
  // `stats`/`chartData`/`paymentBreakdown` reflect whatever period
  // `statsPeriod` says — NOT necessarily the currently-selected `period`.
  // A consumer must compare `statsPeriod === period` before trusting them;
  // otherwise a failed period-switch fetch would silently render the
  // PREVIOUS period's numbers under the NEW period's label. `statsPeriod`
  // is `null` until the very first period fetch ever succeeds.
  stats: DashboardStats | null
  statsPeriod: DashboardPeriod | null
  chartData: ChartBucket[]
  paymentBreakdown: PaymentMethodBreakdown[]
  topProducts: TopProduct[]
  lowStockProducts: ProductRecord[]
  // Loading and error state are tracked as two fully separate pairs, one
  // per independent data source (period-scoped vs. static), and never
  // combined into a single flag/message — combining them let one source's
  // success/failure silently mask the other's (Phase 11 final-review
  // findings). A consumer renders each source's own region from its own
  // pair.
  staticLoading: boolean
  staticError: string | null
  periodLoading: boolean
  periodError: string | null
}

export function useDashboard(): UseDashboardResult {
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsPeriod, setStatsPeriod] = useState<DashboardPeriod | null>(null)
  const [chartData, setChartData] = useState<ChartBucket[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdown[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<ProductRecord[]>([])
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
        // One shared instant for all three calls, so they can't disagree
        // about "now" if the parallel calls happen to straddle local
        // midnight.
        const referenceDateIso = new Date().toISOString()
        const [statsResult, chartDataResult, paymentBreakdownResult] = await Promise.all([
          window.api.dashboard.stats(period, referenceDateIso),
          window.api.dashboard.chartData(period, referenceDateIso),
          window.api.dashboard.paymentBreakdown(period, referenceDateIso)
        ])
        if (!ignore) {
          setStats(statsResult)
          setStatsPeriod(period)
          setChartData(chartDataResult)
          setPaymentBreakdown(paymentBreakdownResult)
          setPeriodError(null)
        }
      } catch (err) {
        if (!ignore) {
          // Deliberately do NOT touch stats/chartData/paymentBreakdown or
          // statsPeriod here — a consumer compares statsPeriod to the
          // current `period` and must see a mismatch (or null) rather than
          // stale data that would otherwise render under the new period's
          // label with no visible sign it's wrong.
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
    statsPeriod,
    chartData,
    paymentBreakdown,
    topProducts,
    lowStockProducts,
    staticLoading,
    staticError,
    periodLoading,
    periodError
  }
}
