import { useState } from 'react'
import ProductsPage from './features/products/ProductsPage'
import PosPage from './features/cart/PosPage'
import DashboardPage from './features/dashboard/DashboardPage'
import SalesHistoryPage from './features/sales-history/SalesHistoryPage'

type Tab = 'pos' | 'products' | 'dashboard' | 'salesHistory'

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('pos')

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <button
          type="button"
          className={`nav-tab ${tab === 'pos' ? 'is-active' : ''}`}
          onClick={() => setTab('pos')}
        >
          POS
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'products' ? 'is-active' : ''}`}
          onClick={() => setTab('products')}
        >
          Products
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'dashboard' ? 'is-active' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'salesHistory' ? 'is-active' : ''}`}
          onClick={() => setTab('salesHistory')}
        >
          Sales History
        </button>
      </nav>
      <div className="app-content">
        {tab === 'pos' && <PosPage />}
        {tab === 'products' && <ProductsPage />}
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'salesHistory' && <SalesHistoryPage />}
      </div>
    </div>
  )
}

export default App
