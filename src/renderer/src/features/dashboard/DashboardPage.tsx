import { useDashboard } from './useDashboard'
import BarChart from './BarChart'
import DonutChart from './DonutChart'
import { Money } from '../../../../shared/money'
import type { DashboardPeriod } from '../../../../shared/dashboard'

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

function DashboardPage(): React.JSX.Element {
  const {
    period,
    setPeriod,
    stats,
    chartData,
    paymentBreakdown,
    topProducts,
    lowStockProducts,
    loading,
    error
  } = useDashboard()

  if (loading) {
    return (
      <div className="products-page">
        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          Loading dashboard…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="products-page">
        <div className="products-header">
          <h1>Dashboard</h1>
        </div>
        <p role="alert" className="alert alert-danger alert-inline">
          {error}
        </p>
      </div>
    )
  }

  const current = stats?.current ?? {
    salesCents: 0,
    orderCount: 0,
    unitsSold: 0,
    avgOrderValueCents: 0
  }
  const previous = stats?.previous ?? {
    salesCents: 0,
    orderCount: 0,
    unitsSold: 0,
    avgOrderValueCents: 0
  }

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
        <StatCard
          label="Total Sales"
          value={Money.fromCents(current.salesCents).format()}
          current={current.salesCents}
          previous={previous.salesCents}
        />
        <StatCard
          label="Total Orders"
          value={String(current.orderCount)}
          current={current.orderCount}
          previous={previous.orderCount}
        />
        <StatCard
          label="Avg Order Value"
          value={Money.fromCents(current.avgOrderValueCents).format()}
          current={current.avgOrderValueCents}
          previous={previous.avgOrderValueCents}
        />
        <StatCard
          label="Units Sold"
          value={String(current.unitsSold)}
          current={current.unitsSold}
          previous={previous.unitsSold}
        />
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel dashboard-panel-chart">
          <h2>{period === 'today' ? 'Today by Hour' : 'Last 7 Days'}</h2>
          <BarChart
            data={chartData}
            ariaLabel={period === 'today' ? 'Sales by hour, today' : 'Sales for the last 7 days'}
          />
        </div>

        <div className="dashboard-panel dashboard-panel-donut">
          <h2>Sales by Payment Method</h2>
          <DonutChart data={paymentBreakdown} />
        </div>

        <div className="dashboard-panel dashboard-panel-top">
          <h2>Top Products</h2>
          {topProducts.length === 0 ? (
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
          {lowStockProducts.length === 0 ? (
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
