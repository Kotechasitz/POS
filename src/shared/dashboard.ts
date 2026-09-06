import type { PaymentMethod } from './sale'

export type DashboardPeriod = 'today' | '7days'

export interface PeriodStats {
  salesCents: number
  orderCount: number
  unitsSold: number
  avgOrderValueCents: number
}

export interface DashboardStats {
  current: PeriodStats
  previous: PeriodStats
}

export interface ChartBucket {
  label: string
  totalCents: number
}

export interface PaymentMethodBreakdown {
  paymentMethod: PaymentMethod
  totalCents: number
  count: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalQuantity: number
  totalRevenueCents: number
}
