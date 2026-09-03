export interface SaleLineInput {
  productId: string
  productName: string
  unitPriceCents: number
  quantity: number
}

export interface SaleItemRecord {
  id: string
  saleId: string
  productId: string
  productName: string
  priceCents: number
  quantity: number
  totalCents: number
}

export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  createdAt: string
  items: SaleItemRecord[]
}
