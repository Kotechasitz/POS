import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardPage from './DashboardPage'
import type {
  DashboardStats,
  ChartBucket,
  PaymentMethodBreakdown,
  TopProduct
} from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const todayStats: DashboardStats = {
  current: { salesCents: 4000, orderCount: 2, unitsSold: 5, avgOrderValueCents: 2000 },
  previous: { salesCents: 2000, orderCount: 1, unitsSold: 2, avgOrderValueCents: 2000 }
}
const sevenDayStats: DashboardStats = {
  current: { salesCents: 9000, orderCount: 5, unitsSold: 12, avgOrderValueCents: 1800 },
  previous: { salesCents: 8000, orderCount: 4, unitsSold: 10, avgOrderValueCents: 2000 }
}
const hourlyChart: ChartBucket[] = [{ label: '9 AM', totalCents: 4000 }]
const sevenDayChart: ChartBucket[] = [{ label: 'Mon', totalCents: 9000 }]
const paymentBreakdown: PaymentMethodBreakdown[] = [
  { paymentMethod: 'CASH', totalCents: 4000, count: 2 }
]
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const lowStock: ProductRecord[] = [
  {
    id: '1',
    barcode: '111',
    name: 'Water',
    priceCents: 1000,
    stock: 1,
    isActive: true,
    categoryId: null,
    imagePath: null,
    createdAt: '',
    updatedAt: ''
  }
]

describe('DashboardPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        stats: vi
          .fn()
          .mockImplementation((period: string) =>
            Promise.resolve(period === 'today' ? todayStats : sevenDayStats)
          ),
        chartData: vi
          .fn()
          .mockImplementation((period: string) =>
            Promise.resolve(period === 'today' ? hourlyChart : sevenDayChart)
          ),
        paymentBreakdown: vi.fn().mockResolvedValue(paymentBreakdown),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn(), void: vi.fn(), exportCsv: vi.fn() }
    } as unknown as Window['api']
  })

  it('renders all four stat cards, formatted as money where applicable, with a growth indicator', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())

    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    expect(within(salesCard).getByText('฿40.00')).toBeInTheDocument()
    // current 4000 vs previous 2000 -> +100%
    expect(within(salesCard).getByText('+100% vs previous period')).toBeInTheDocument()

    const ordersCard = screen.getByText('Total Orders').closest('.stat-card') as HTMLElement
    expect(within(ordersCard).getByText('2')).toBeInTheDocument()

    const avgCard = screen.getByText('Avg Order Value').closest('.stat-card') as HTMLElement
    expect(within(avgCard).getByText('฿20.00')).toBeInTheDocument()

    const unitsCard = screen.getByText('Units Sold').closest('.stat-card') as HTMLElement
    expect(within(unitsCard).getByText('5')).toBeInTheDocument()
  })

  it("shows a neutral '—' growth indicator when the previous period has no data", async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockResolvedValue({
      current: { salesCents: 5000, orderCount: 1, unitsSold: 1, avgOrderValueCents: 5000 },
      previous: { salesCents: 0, orderCount: 0, unitsSold: 0, avgOrderValueCents: 0 }
    })
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())
    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    expect(within(salesCard).getByText('— vs previous period')).toBeInTheDocument()
  })

  it('defaults to the Today period and switching to 7 Days re-fetches stats, chart, and breakdown', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument())
    expect(screen.getByLabelText('Period')).toHaveValue('today')
    expect(screen.getByText('Today by Hour')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Period'), '7days')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Last 7 Days' })).toBeInTheDocument()
    )
    const salesCard = screen.getByText('Total Sales').closest('.stat-card') as HTMLElement
    // current 9000 vs previous 8000 -> +13%
    await waitFor(() => expect(within(salesCard).getByText('฿90.00')).toBeInTheDocument())
    expect(within(salesCard).getByText('+13% vs previous period')).toBeInTheDocument()
  })

  it('renders the payment method donut chart', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Sales by Payment Method')).toBeInTheDocument())
    expect(screen.getByText('฿40.00 (100%)')).toBeInTheDocument()
  })

  it('renders the top products list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('1. Coke')).toBeInTheDocument())
    expect(screen.getByText('5 sold · ฿100.00')).toBeInTheDocument()
  })

  it('renders the low stock list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
    expect(screen.getByText('1 left')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no top products yet', async () => {
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getAllByText('No sales yet').length).toBeGreaterThan(0))
  })

  it('shows an error message when loading fails', async () => {
    ;(window.api.dashboard.stats as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})
