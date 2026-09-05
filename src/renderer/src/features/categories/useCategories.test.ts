import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCategories } from './useCategories'
import type { CategoryRecord } from '../../../../shared/category'

const beverages: CategoryRecord = {
  id: '1',
  name: 'Beverages',
  createdAt: '',
  updatedAt: ''
}

describe('useCategories', () => {
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

  it('loads categories on mount', async () => {
    const { result } = renderHook(() => useCategories())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([beverages])
    expect(result.current.error).toBeNull()
  })

  it('surfaces a clean error message on a failed load', async () => {
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Error invoking remote method 'categories:list': Something broke")
    )
    const { result } = renderHook(() => useCategories())

    await waitFor(() => expect(result.current.error).toBe('Something broke'))
  })

  it('createCategory adds a category and reloads the list', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const snacks: CategoryRecord = { id: '2', name: 'Snacks', createdAt: '', updatedAt: '' }
    ;(window.api.categories.create as ReturnType<typeof vi.fn>).mockResolvedValue(snacks)
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([beverages, snacks])

    await act(async () => {
      await result.current.createCategory('Snacks')
    })

    expect(window.api.categories.create).toHaveBeenCalledWith('Snacks')
    expect(result.current.categories).toEqual([beverages, snacks])
  })

  it('deleteCategory removes a category and reloads the list', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))

    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await act(async () => {
      await result.current.deleteCategory('1')
    })

    expect(window.api.categories.delete).toHaveBeenCalledWith('1')
    expect(result.current.categories).toEqual([])
  })

  it('updateCategory renames a category and reloads the list', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const renamed: CategoryRecord = { id: '1', name: 'Drinks', createdAt: '', updatedAt: '' }
    ;(window.api.categories.update as ReturnType<typeof vi.fn>).mockResolvedValue(renamed)
    ;(window.api.categories.list as ReturnType<typeof vi.fn>).mockResolvedValue([renamed])

    await act(async () => {
      await result.current.updateCategory('1', 'Drinks')
    })

    expect(window.api.categories.update).toHaveBeenCalledWith('1', 'Drinks')
    expect(result.current.categories).toEqual([renamed])
  })
})
