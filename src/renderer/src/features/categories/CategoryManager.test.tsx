import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryManager from './CategoryManager'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = { id: '1', name: 'Beverages', createdAt: '', updatedAt: '' }

describe('CategoryManager', () => {
  it('lists existing categories', () => {
    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Beverages')).toBeInTheDocument()
  })

  it('adds a new category', async () => {
    const user = userEvent.setup()
    const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }
    const onCreate = vi.fn().mockResolvedValue(snacks)

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('New category name'), 'Snacks')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Snacks'))
  })

  it('deletes a category', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('1'))
  })

  it('shows an error message when deleting a category still in use', async () => {
    const user = userEvent.setup()
    const onDelete = vi
      .fn()
      .mockRejectedValue(
        new Error('Cannot delete "Beverages": 2 product(s) are still assigned to it')
      )

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete Beverages' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot delete "Beverages": 2 product(s) are still assigned to it'
      )
    )
  })

  it('renames a category', async () => {
    const user = userEvent.setup()
    const renamed: CategoryRecord = { ...beverages, name: 'Drinks' }
    const onUpdate = vi.fn().mockResolvedValue(renamed)

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Rename Beverages' }))
    const input = screen.getByLabelText('Rename Beverages')
    await user.clear(input)
    await user.type(input, 'Drinks')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', 'Drinks'))
  })

  it('cancels a rename without calling onUpdate', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Rename Beverages' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Rename Beverages' })).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('shows an error message when a rename fails', async () => {
    const user = userEvent.setup()
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new Error('A category named "Drinks" already exists'))

    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Rename Beverages' }))
    const input = screen.getByLabelText('Rename Beverages')
    await user.clear(input)
    await user.type(input, 'Drinks')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A category named "Drinks" already exists'
      )
    )
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CategoryManager
        categories={[beverages]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a loading row instead of the category list while loading', () => {
    render(
      <CategoryManager
        categories={[]}
        loading={true}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Loading categories…')).toBeInTheDocument()
  })
})
