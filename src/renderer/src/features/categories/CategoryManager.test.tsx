import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryManager from './CategoryManager'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

describe('CategoryManager', () => {
  beforeEach(() => {
    window.api = {
      dbHealth: vi.fn(),
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getByBarcode: vi.fn() },
      sales: { complete: vi.fn() },
      dashboard: { summary: vi.fn(), topProducts: vi.fn(), sevenDaySales: vi.fn(), lowStock: vi.fn() },
      salesHistory: { list: vi.fn(), detail: vi.fn() },
      categories: {
        list: vi.fn().mockResolvedValue([beverages]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    } as unknown as Window['api']
  })

  it('lists existing categories', async () => {
    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())
  })

  it('adds a new category', async () => {
    const user = userEvent.setup()
    const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }
    ;(window.api.categories.create as ReturnType<typeof vi.fn>).mockResolvedValue(snacks)
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([beverages, snacks])

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.type(screen.getByLabelText('New category name'), 'Snacks')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Snacks')).toBeInTheDocument())
    expect(window.api.categories.create).toHaveBeenCalledWith('Snacks')
  })

  it('deletes a category', async () => {
    const user = userEvent.setup()

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() => expect(screen.queryByText('Beverages')).not.toBeInTheDocument())
  })

  it('shows an error message when deleting a category still in use', async () => {
    const user = userEvent.setup()
    ;(window.api.categories.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(
        "Error invoking remote method 'categories:delete': CategoryInUseError: Cannot delete \"Beverages\": 2 product(s) are still assigned to it"
      )
    )

    render(<CategoryManager onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot delete "Beverages": 2 product(s) are still assigned to it'
      )
    )
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CategoryManager onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Beverages')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })
})
