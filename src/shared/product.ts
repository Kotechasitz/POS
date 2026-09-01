import type { ProductRow } from '../main/database/schema'

export type ProductRecord = ProductRow

export interface CreateProductInput {
  barcode: string
  name: string
  priceCents: number
  stock: number
}

export interface UpdateProductInput {
  barcode?: string
  name?: string
  priceCents?: number
  stock?: number
  isActive?: boolean
}
