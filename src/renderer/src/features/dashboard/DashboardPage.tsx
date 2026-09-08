import { useDashboard } from './useDashboard'
import BarChart from './BarChart'
import DonutChart from './DonutChart'
import { Money } from '../../../../shared/money'
import type { DashboardPeriod, PeriodStats } from '../../../../shared/dashboard'

interface StatCardProps {
  label: string
  value: string
  current: number
  previous: number
}

function formatGrowth(current: number, previous: number): { text: string; className: string } {
  if (previous === 0) {
    return { text: '—', className: 'stat-growth-neutral' }
  }
  const percent = Math.round(((current - previous) / previous) * 100)
  if (percent > 0) {
    return { text: `+${percent}%`, className: 'stat-growth-positive' }
  }
  if (percent < 0) {
    return { text: `${percent}%`, className: 'stat-growth-negative' }
  }
  return { text: '0%', className: 'stat-growth-neutral' }
}

function StatCard({ label, value, current, previous }: StatCardProps): React.JSX.Element {
  const growth = formatGrowth(current, previous)
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className={`stat-growth ${growth.className}`}>{growth.text} vs previous period</span>
    </div>
  )
}

// One definition of the four cards, mapped over rather than hand-copied —
// adding a fifth stat means adding one entry here, not a fifth JSX block
// that could drift from the others (e.g. a pasted card left pointing at
// the wrong PeriodStats field).
const STAT_CARD_CONFIG: {
  key: string
  label: string
  field: keyof PeriodStats
  format: (value: number) => string
}[] = [
  {
    key: 'sales',
    label: 'Total Sales',
    field: 'salesCents',
    format: (value) => Money.fromCents(value).format()
  },
  { key: 'orders', label: 'Total Orders', field: 'orderCount', format: (value) => String(value) },
  {
    key: 'avgOrder',
    label: 'Avg Order Value',
    field: 'avgOrderValueCents',
    format: (value) => Money.fromCents(value).format()
  },
  { key: 'units', label: 'Units Sold', field: 'unitsSold', format: (value) => String(value) }
]

function LoadingRow({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="loading-row">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

interface StaticErrorNoticeProps {
  message: string
  onRetry: () => void
}

// The static effect (Top Products/Low Stock) only ever runs once on mount
// — unlike the period effect, nothing else naturally re-triggers it — so
// its error needs an explicit way to recover. Only ever rendered while
// staticLoading is false (see the two call sites below), so there's no
// separate "retrying" state to show here — once Retry is clicked,
// staticLoading flips true and this notice is replaced by the LoadingRow
// branch until the retry settles.
function StaticErrorNotice({ message, onRetry }: StaticErrorNoticeProps): React.JSX.Element {
  return (
    <div className="alert alert-danger alert-inline alert-with-action" role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function DashboardPage(): React.JSX.Element {
  const {
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
    reloadStatic,
    periodLoading,
    periodError
  } = useDashboard()

  // `stats` may still hold a PREVIOUS period's data if the fetch for the
  // currently-selected `period` hasn't landed yet or just failed — only
  // trust it once `statsPeriod` actually matches `period`.
  const periodContentReady = stats !== null && statsPeriod === period

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Dashboard</h1>
        <div className="field">
          <label htmlFor="dashboard-period">Period</label>
          <select
            id="dashboard-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
          </select>
        </div>
      </div>

      <div className="dashboard-stats">
        {periodLoading && !periodContentReady ? (
          <LoadingRow label="Loading stats…" />
        ) : periodContentReady && stats ? (
          STAT_CARD_CONFIG.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.format(stats.current[card.field])}
              current={stats.current[card.field]}
              previous={stats.previous[card.field]}
            />
          ))
        ) : (
          periodError && (
            <p role="alert" className="alert alert-danger alert-inline">
              {periodError}
            </p>
          )
        )}
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel dashboard-panel-chart">
          <h2>{period === 'today' ? 'Today by Hour' : 'Last 7 Days'}</h2>
          {periodLoading && !periodContentReady ? (
            <LoadingRow label="Loading chart…" />
          ) : periodContentReady ? (
            <BarChart
              data={chartData}
              ariaLabel={period === 'today' ? 'Sales by hour, today' : 'Sales for the last 7 days'}
            />
          ) : (
            periodError && (
              <p role="alert" className="alert alert-danger alert-inline">
                {periodError}
              </p>
            )
          )}
        </div>

        <div className="dashboard-panel dashboard-panel-donut">
          <h2>Sales by Payment Method</h2>
          {periodLoading && !periodContentReady ? (
            <LoadingRow label="Loading…" />
          ) : periodContentReady ? (
            <DonutChart data={paymentBreakdown} />
          ) : (
            periodError && (
              <p role="alert" className="alert alert-danger alert-inline">
                {periodError}
              </p>
            )
          )}
        </div>

        <div className="dashboard-panel dashboard-panel-top">
          <h2>Top Products</h2>
          {staticLoading ? (
            <LoadingRow label="Loading…" />
          ) : staticError ? (
            <StaticErrorNotice message={staticError} onRetry={reloadStatic} />
          ) : topProducts.length === 0 ? (
            <p className="empty-hint">No sales yet</p>
          ) : (
            <ol className="top-products-list">
              {topProducts.map((product, index) => (
                <li key={product.productId}>
                  <span>
                    {index + 1}. {product.productName}
                  </span>
                  <span>
                    {product.totalQuantity} sold ·{' '}
                    {Money.fromCents(product.totalRevenueCents).format()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="dashboard-panel dashboard-panel-low">
          <h2>Low Stock</h2>
          {staticLoading ? (
            <LoadingRow label="Loading…" />
          ) : staticError ? (
            <StaticErrorNotice message={staticError} onRetry={reloadStatic} />
          ) : lowStockProducts.length === 0 ? (
            <p className="empty-hint">Nothing low on stock</p>
          ) : (
            <ul className="low-stock-list">
              {lowStockProducts.map((product) => (
                <li key={product.id}>
                  <span>{product.name}</span>
                  <span className="badge badge-inactive">{product.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
