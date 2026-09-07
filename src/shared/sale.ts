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

// The one human-readable label per payment method — every UI surface that
// displays a PaymentMethod to a user (the checkout modal, the Dashboard's
// payment-method chart, ...) reads from this, not a locally re-hardcoded
// copy that could drift from it.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  QR: 'QR',
  CARD: 'Card'
}

export const SALE_STATUSES = ['COMPLETED', 'VOID'] as const

export type SaleStatus = (typeof SALE_STATUSES)[number]

export interface SaleRecord {
  id: string
  totalCents: number
  status: SaleStatus
  paymentMethod: PaymentMethod
  discountCents: number
  createdAt: string
  items: SaleItemRecord[]
  voidReason?: string
  voidedAt?: string
}
