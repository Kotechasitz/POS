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

  // `ignore` guards against a stale/out-of-order response overwriting a
  // newer one — the same react.dev "Fetching data" ignore-flag pattern
  // useProducts.ts already uses. Without it, an in-flight reload from a
  // cleaned-up effect (e.g. a React StrictMode double-mount) could still
  // land after a newer one and revert the shared categories state to stale
  // data. Mutation call sites always pass { current: false } — a reload
  // they explicitly triggered should never be ignored.
  const reload = useCallback(async (ignore: { current: boolean }): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.categories.list()
      if (!ignore.current) {
        setCategories(result)
        setError(null)
      }
    } catch (err) {
      if (!ignore.current) {
        setError(toUserMessage(err))
      }
    } finally {
      if (!ignore.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const ignore = { current: false }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(ignore)
    return () => {
      ignore.current = true
    }
  }, [reload])

  const createCategory = useCallback(
    async (name: string): Promise<CategoryRecord> => {
      let created: CategoryRecord
      try {
        created = await window.api.categories.create(name)
      } catch (err) {
        throw new Error(toUserMessage(err))
      }
      await reload({ current: false })
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
      await reload({ current: false })
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
      await reload({ current: false })
    },
    [reload]
  )

  return { categories, loading, error, createCategory, updateCategory, deleteCategory }
}
