export interface ProductRecord {
  id: string
  barcode: string
  name: string
  priceCents: number
  stock: number
  isActive: boolean
  categoryId: string | null
  imagePath: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  barcode: string
  name: string
  priceCents: number
  stock: number
  categoryId?: string | null
  imageSourcePath?: string | null
}

export interface UpdateProductInput {
  barcode?: string
  name?: string
  priceCents?: number
  stock?: number
  isActive?: boolean
  categoryId?: string | null
  imageSourcePath?: string | null
  clearImage?: boolean
}
