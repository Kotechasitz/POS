import { useCallback, useEffect, useState } from 'react'
import type { CategoryRecord } from '../../../../shared/category'
import { toUserMessage } from '../../lib/ipcError'

export interface UseCategoriesResult {
  categories: CategoryRecord[]
  loading: boolean
  error: string | null
  createCategory: (name: string) => Promise<CategoryRecord>
  updateCategory: (id: string, name: string) => Promise<CategoryRecord>
  deleteCategory: (id: string) => Promise<void>
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.categories.list()
      setCategories(result)
      setError(null)
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const createCategory = useCallback(
    async (name: string): Promise<CategoryRecord> => {
      let created: CategoryRecord
      try {
        created = await window.api.categories.create(name)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
      return created
    },
    [reload]
  )

  const updateCategory = useCallback(
    async (id: string, name: string): Promise<CategoryRecord> => {
      let updated: CategoryRecord
      try {
        updated = await window.api.categories.update(id, name)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
      return updated
    },
    [reload]
  )

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      try {
        await window.api.categories.delete(id)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload()
    },
    [reload]
  )

  return { categories, loading, error, createCategory, updateCategory, deleteCategory }
}
