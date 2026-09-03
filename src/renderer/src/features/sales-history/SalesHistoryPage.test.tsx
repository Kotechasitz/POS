import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalesHistoryPage from './SalesHistoryPage'
import type { SaleListItem } from '../../../../shared/salesHistory'
import type { SaleRecord } from '../../../../shared/sale'

const list: SaleListItem[] = [
  {
    id: 'sale-1',
    billNumber: 1,
    totalCents: 4000,
    createdAt: '2026-09-03T10:00:00.000Z',
    itemCount: 2
  }
]

const detail: SaleRecord = {
  id: 'sale-1',
  totalCents: 4000,
  status: 'COMPLETED',
  createdAt: '2026-09-03T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      saleId: 'sale-1',
      productId: '1',
      productName: 'Coke',
      priceCents: 2000,
      quantity: 2,
      totalCents: 4000
    }
  ]
}

describe('SalesHistoryPage', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: {
        summary: vi.fn(),
        topProducts: vi.fn(),
        sevenDaySales: vi.fn(),
        lowStock: vi.fn()
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue(list),
        detail: vi.fn().mockResolvedValue(detail)
      }
    } as unknown as Window['api']
  })

  it('renders the bill number, total, and item count for each sale', async () => {
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    expect(screen.getByText('฿40.00')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows an empty state when there are no sales', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('opens the detail modal with the line items when View is clicked', async () => {
    const user = userEvent.setup()
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('Coke')).toBeInTheDocument()
  })

  it('shows an error if the detail fetch fails', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.detail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    )
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })

  it('strips the Electron IPC wrapper text from a detail-fetch failure', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.detail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'salesHistory:detail': Something broke")
    )
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something broke'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('Error invoking remote method')
  })
})
