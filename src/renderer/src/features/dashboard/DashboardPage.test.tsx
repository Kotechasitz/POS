import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from './DashboardPage'
import type { DashboardSummary, TopProduct, DailySales } from '../../../../shared/dashboard'
import type { ProductRecord } from '../../../../shared/product'

const summary: DashboardSummary = { salesTodayCents: 4000, orderCountToday: 2, unitsSoldToday: 5 }
const topProducts: TopProduct[] = [
  { productId: '1', productName: 'Coke', totalQuantity: 5, totalRevenueCents: 10000 }
]
const sevenDaySales: DailySales[] = [{ date: '2026-09-03', totalCents: 4000 }]
const lowStock: ProductRecord[] = [
  {
    id: '1',
    barcode: '111',
    name: 'Water',
    priceCents: 1000,
    stock: 1,
    isActive: true,
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
        summary: vi.fn().mockResolvedValue(summary),
        topProducts: vi.fn().mockResolvedValue(topProducts),
        sevenDaySales: vi.fn().mockResolvedValue(sevenDaySales),
        lowStock: vi.fn().mockResolvedValue(lowStock)
      },
      salesHistory: { list: vi.fn(), detail: vi.fn() }
    } as unknown as Window['api']
  })

  it('renders the summary stats, formatted as money where applicable', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('฿40.00')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the top products list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Coke')).toBeInTheDocument())
    expect(screen.getByText('5 sold')).toBeInTheDocument()
  })

  it('renders the low stock list', async () => {
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument())
    expect(screen.getByText('1 left')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no top products yet', async () => {
    ;(window.api.dashboard.topProducts as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('shows an error message when loading fails', async () => {
    ;(window.api.dashboard.summary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    render(<DashboardPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})
