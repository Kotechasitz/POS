export interface ProductRecord {
  id: string
  barcode: string
  name: string
  priceCents: number
  stock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

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
