import { describe, it, expect } from 'vitest'
import { Money } from './money'

describe('Money', () => {
  it('converts baht to integer satang cents', () => {
    expect(Money.fromBaht(20.5).cents).toBe(2050)
  })

  it('rejects negative amounts', () => {
    expect(() => Money.fromBaht(-1)).toThrow('cannot be negative')
  })

  it('rejects non-integer cents', () => {
    expect(() => Money.fromCents(10.5)).toThrow('integer number of satang')
  })

  it('adds two amounts without floating-point drift', () => {
    const a = Money.fromBaht(0.1)
    const b = Money.fromBaht(0.2)
    expect(a.add(b).cents).toBe(30)
  })

  it('subtracts one amount from another', () => {
    const total = Money.fromBaht(40)
    const discount = Money.fromBaht(5)
    expect(total.subtract(discount).cents).toBe(3500)
  })

  it('rejects a subtraction that would go negative', () => {
    const total = Money.fromBaht(10)
    const discount = Money.fromBaht(15)
    expect(() => total.subtract(discount)).toThrow('cannot be negative')
  })

  it('computes a line total as unit price times quantity', () => {
    const unitPrice = Money.fromBaht(20)
    expect(unitPrice.multiply(3).cents).toBe(6000)
  })

  it('rejects a negative or fractional quantity', () => {
    const unitPrice = Money.fromBaht(20)
    expect(() => unitPrice.multiply(-1)).toThrow('non-negative integer')
    expect(() => unitPrice.multiply(1.5)).toThrow('non-negative integer')
  })

  it('formats as Thai baht with a currency symbol', () => {
    expect(Money.fromCents(124000).format()).toBe('฿1240.00')
  })

  it('compares equality by cents', () => {
    expect(Money.fromBaht(10).equals(Money.fromCents(1000))).toBe(true)
    expect(Money.fromBaht(10).equals(Money.fromCents(1001))).toBe(false)
  })

  it('parses a valid baht string from user input', () => {
    expect(Money.parseBaht('20.50')?.cents).toBe(2050)
  })

  it('returns null for empty, non-numeric, or negative baht input', () => {
    expect(Money.parseBaht('')).toBeNull()
    expect(Money.parseBaht('   ')).toBeNull()
    expect(Money.parseBaht('abc')).toBeNull()
    expect(Money.parseBaht('-5')).toBeNull()
  })
})
