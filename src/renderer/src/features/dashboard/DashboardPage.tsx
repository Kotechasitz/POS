import { useDashboard } from './useDashboard'
import BarChart from './BarChart'
import { Money } from '../../../../shared/money'

function DashboardPage(): React.JSX.Element {
  const { summary, topProducts, sevenDaySales, lowStockProducts, loading, error } = useDashboard()

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

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-label">Sales Today</span>
          <span className="stat-value">
            {Money.fromCents(summary?.salesTodayCents ?? 0).format()}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Orders Today</span>
          <span className="stat-value">{summary?.orderCountToday ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Units Sold Today</span>
          <span className="stat-value">{summary?.unitsSoldToday ?? 0}</span>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <h2>Last 7 Days</h2>
          <BarChart data={sevenDaySales} />
        </div>

        <div className="dashboard-panel">
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

        <div className="dashboard-panel">
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
