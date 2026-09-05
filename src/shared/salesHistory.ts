import type { PaymentMethod } from './sale'

export interface SaleListItem {
  id: string
  billNumber: number
  totalCents: number
  createdAt: string
  itemCount: number
  status: string
  paymentMethod: PaymentMethod
}
