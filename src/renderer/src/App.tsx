import { useState } from 'react'
import ProductsPage from './features/products/ProductsPage'
import PosPage from './features/cart/PosPage'

type Tab = 'pos' | 'products'

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
      </nav>
      <div className="app-content">{tab === 'pos' ? <PosPage /> : <ProductsPage />}</div>
    </div>
  )
}

export default App
