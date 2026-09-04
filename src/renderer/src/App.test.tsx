import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        getByBarcode: vi.fn()
      },
      sales: {
        complete: vi.fn()
      },
      dashboard: {
        summary: vi
          .fn()
          .mockResolvedValue({ salesTodayCents: 0, orderCountToday: 0, unitsSoldToday: 0 }),
        topProducts: vi.fn().mockResolvedValue([]),
        sevenDaySales: vi.fn().mockResolvedValue([]),
        lowStock: vi.fn().mockResolvedValue([])
      },
      salesHistory: {
        list: vi.fn().mockResolvedValue([]),
        detail: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('shows the POS screen by default', () => {
    render(<App />)
    expect(screen.getByLabelText('Barcode')).toBeInTheDocument()
  })

  it('switches to the Products screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Products' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument()
    )
  })

  it('switches to the Dashboard screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))

    await waitFor(() => expect(screen.getByText('Sales Today')).toBeInTheDocument())
  })

  it('switches to the Sales History screen when its tab is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sales History' }))

    await waitFor(() => expect(screen.getByText('No sales yet')).toBeInTheDocument())
  })

  it('re-fetches dashboard data each time the tab is re-entered', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await waitFor(() => expect(window.api.dashboard.summary).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'POS' }))
    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await waitFor(() => expect(window.api.dashboard.summary).toHaveBeenCalledTimes(2))
  })

  it('switches back to the POS screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Products' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'POS' }))

    await waitFor(() => expect(screen.getByLabelText('Barcode')).toBeInTheDocument())
  })
})
