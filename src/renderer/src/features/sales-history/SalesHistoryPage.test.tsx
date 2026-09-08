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
    itemCount: 2,
    status: 'COMPLETED',
    paymentMethod: 'CASH'
  }
]

const voidedList: SaleListItem = {
  id: 'sale-2',
  billNumber: 2,
  totalCents: 1000,
  createdAt: '2026-09-04T09:00:00.000Z',
  itemCount: 1,
  status: 'VOID',
  paymentMethod: 'QR'
}

const detail: SaleRecord = {
  id: 'sale-1',
  totalCents: 4000,
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  discountCents: 0,
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
        detail: vi.fn().mockResolvedValue(detail),
        void: vi.fn(),
        exportCsv: vi.fn()
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

  it('shows Payment Method and Status columns', async () => {
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    expect(screen.getByRole('cell', { name: 'CASH' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Completed' })).toBeInTheDocument()
  })

  it('filters by payment method', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      list[0],
      voidedList
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    expect(screen.getByText('#2')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by payment method'), 'QR')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      list[0],
      voidedList
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'VOID')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('filters by date range', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      list[0],
      voidedList
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    // list[0].createdAt is 2026-09-03; voidedList.createdAt is 2026-09-04.
    // A From date of 2026-09-04 must exclude the earlier sale and include
    // the one exactly on the boundary (the filter is inclusive).
    await user.type(screen.getByLabelText('From date'), '2026-09-04')

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('filters by local calendar day, not UTC day, for a sale near midnight', async () => {
    const user = userEvent.setup()
    // Construct the fixture and the filter value from the same local Date
    // object, so this test is correct regardless of the machine's actual
    // timezone offset — it never needs to know or mock what that offset is.
    // Local Sept 5, 1:00 AM: in any timezone ahead of UTC this serializes
    // to a UTC ISO string dated Sept 4, which is exactly the case a naive
    // UTC-slice comparison gets wrong.
    const localSept5 = new Date(2026, 8, 5, 1, 0, 0)
    const nearMidnightSale: SaleListItem = {
      id: 'sale-3',
      billNumber: 3,
      totalCents: 500,
      createdAt: localSept5.toISOString(),
      itemCount: 1,
      status: 'COMPLETED',
      paymentMethod: 'CARD'
    }
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      nearMidnightSale
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#3')).toBeInTheDocument())

    // Filtering for its own local day (2026-09-05) must include it.
    await user.type(screen.getByLabelText('From date'), '2026-09-05')
    await user.type(screen.getByLabelText('To date'), '2026-09-05')
    expect(screen.getByText('#3')).toBeInTheDocument()

    // Filtering for the adjacent local day (2026-09-06) must exclude it.
    await user.clear(screen.getByLabelText('From date'))
    await user.type(screen.getByLabelText('From date'), '2026-09-06')
    await user.clear(screen.getByLabelText('To date'))
    await user.type(screen.getByLabelText('To date'), '2026-09-06')
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })

  it('filters by "To date" boundary: includes the exact day, excludes the day before', async () => {
    const user = userEvent.setup()
    // Same local-Date-based construction as the "From date" local-day test
    // above, so this is correct regardless of the machine's timezone offset.
    const localSept5 = new Date(2026, 8, 5, 14, 0, 0)
    const toDateSale: SaleListItem = {
      id: 'sale-4',
      billNumber: 4,
      totalCents: 700,
      createdAt: localSept5.toISOString(),
      itemCount: 1,
      status: 'COMPLETED',
      paymentMethod: 'CARD'
    }
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([toDateSale])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#4')).toBeInTheDocument())

    // A To date of its own local day (2026-09-05) must include it.
    await user.type(screen.getByLabelText('To date'), '2026-09-05')
    expect(screen.getByText('#4')).toBeInTheDocument()

    // A To date of the day before (2026-09-04) must exclude it.
    await user.clear(screen.getByLabelText('To date'))
    await user.type(screen.getByLabelText('To date'), '2026-09-04')
    expect(screen.queryByText('#4')).not.toBeInTheDocument()
  })

  it('shows a Void button only on Completed rows', async () => {
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      list[0],
      voidedList
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    expect(screen.getAllByRole('button', { name: 'Void' })).toHaveLength(1)
  })

  it('voids a sale through the reason-then-confirm flow and reloads the list', async () => {
    const user = userEvent.setup()
    const voided = {
      ...detail,
      status: 'VOID',
      voidReason: 'Wrong order',
      voidedAt: '2026-09-06T12:00:00.000Z'
    }
    ;(window.api.salesHistory.void as ReturnType<typeof vi.fn>).mockResolvedValue(voided)
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    await waitFor(() =>
      expect(window.api.salesHistory.void).toHaveBeenCalledWith('sale-1', 'Wrong order')
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.api.salesHistory.list).toHaveBeenCalledTimes(2)
  })

  it('shows a clean error in the void modal when voiding fails, without closing it', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.void as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        'Error invoking remote method \'salesHistory:void\': SaleAlreadyVoidError: Sale "sale-1" has already been voided'
      )
    )
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Reason'), 'Wrong order')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Void Sale' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('already been voided'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the void modal without voiding when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.api.salesHistory.void).not.toHaveBeenCalled()
  })

  it('exports the currently-filtered list as CSV', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.exportCsv as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false
    })
    ;(window.api.salesHistory.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      list[0],
      voidedList
    ])
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'VOID')
    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() =>
      expect(window.api.salesHistory.exportCsv).toHaveBeenCalledWith([voidedList])
    )
  })

  it('shows an error if the export fails', async () => {
    const user = userEvent.setup()
    ;(window.api.salesHistory.exportCsv as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'salesHistory:exportCsv': Disk is full")
    )
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Disk is full'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('Error invoking remote method')
  })

  it('shows "No matching sales" instead of "No sales yet" when filters exclude every sale', async () => {
    const user = userEvent.setup()
    render(<SalesHistoryPage />)
    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    // list[0].createdAt is 2026-09-03 — filtering From date to a later day
    // excludes it while sales still has data.
    await user.type(screen.getByLabelText('From date'), '2026-09-10')

    await waitFor(() => expect(screen.getByText('No matching sales')).toBeInTheDocument())
    expect(screen.getByText('Try widening the filters above.')).toBeInTheDocument()
    expect(screen.queryByText('No sales yet')).not.toBeInTheDocument()
  })
})
