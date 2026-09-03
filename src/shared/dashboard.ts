export interface DashboardSummary {
  salesTodayCents: number
  orderCountToday: number
  unitsSoldToday: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalQuantity: number
  totalRevenueCents: number
}

export interface DailySales {
  date: string
  totalCents: number
}
