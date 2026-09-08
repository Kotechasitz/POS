import type { PaymentMethod, SaleStatus } from './sale'

export interface SaleListItem {
  id: string
  billNumber: number
  totalCents: number
  createdAt: string
  itemCount: number
  status: SaleStatus
  paymentMethod: PaymentMethod
}
