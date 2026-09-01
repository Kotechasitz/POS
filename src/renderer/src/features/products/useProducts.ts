import { useCallback, useEffect, useState } from 'react'
import type { CreateProductInput, ProductRecord, UpdateProductInput } from '../../../../shared/product'

export interface UseProductsResult {
  products: ProductRecord[]
  loading: boolean
  error: string | null
  query: string
  setQuery: (query: string) => void
  createProduct: (input: CreateProductInput) => Promise<ProductRecord>
  updateProduct: (id: string, input: UpdateProductInput) => Promise<ProductRecord>
}

export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const reload = useCallback(async (currentQuery: string, ignore: { current: boolean }) => {
    setLoading(true)
    try {
      const result = await window.api.products.list(currentQuery || undefined)
      if (!ignore.current) {
        setProducts(result)
        setError(null)
      }
    } catch (err) {
      if (!ignore.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (!ignore.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const ignore = { current: false }
    // reload() sets `loading` synchronously before its first await (the
    // standard react.dev "Fetching data" ignore-flag pattern for
    // race-safe effects). eslint-plugin-react-hooks v7's set-state-in-effect
    // rule flags that as a rule of thumb; it's deliberate here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(query, ignore)
    return () => {
      ignore.current = true
    }
  }, [query, reload])

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<ProductRecord> => {
      const created = await window.api.products.create(input)
      await reload(query, { current: false })
      return created
    },
    [query, reload]
  )

  const updateProduct = useCallback(
    async (id: string, input: UpdateProductInput): Promise<ProductRecord> => {
      const updated = await window.api.products.update(id, input)
      await reload(query, { current: false })
      return updated
    },
    [query, reload]
  )

  return { products, loading, error, query, setQuery, createProduct, updateProduct }
}
