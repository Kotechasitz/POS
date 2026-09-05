import { useCallback, useEffect, useRef, useState } from 'react'
import { useCartStore } from './cartStore'

export interface UseBarcodeScanResult {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  setValue: (value: string) => void
  error: string | null
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  scan: (barcode: string) => Promise<void>
  clearError: () => void
}

export function useBarcodeScan(): UseBarcodeScanResult {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addScannedProduct = useCartStore((state) => state.addScannedProduct)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const scan = useCallback(
    async (rawBarcode: string) => {
      const barcode = rawBarcode.trim()
      if (barcode.length === 0) {
        return
      }

      try {
        const product = await window.api.products.getByBarcode(barcode)
        if (!product) {
          setError(`Barcode not found: ${barcode}`)
        } else if (!product.isActive) {
          setError(`${product.name} is not available for sale`)
        } else {
          const result = addScannedProduct(product)
          if (!result.ok) {
            setError(`Not enough stock for ${product.name}`)
          } else {
            setError(null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }

      setValue('')
      inputRef.current?.focus()
    },
    [addScannedProduct]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        scan(value)
      }
    },
    [scan, value]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { inputRef, value, setValue, error, handleKeyDown, scan, clearError }
}
