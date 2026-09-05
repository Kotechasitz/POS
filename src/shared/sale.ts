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

export const PAYMENT_METHODS = ['CASH', 'QR', 'CARD'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface SaleRecord {
  id: string
  totalCents: number
  status: string
  paymentMethod: PaymentMethod
  discountCents: number
  createdAt: string
  items: SaleItemRecord[]
  voidReason?: string
  voidedAt?: string
}
