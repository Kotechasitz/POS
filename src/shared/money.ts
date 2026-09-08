export class Money {
  private constructor(private readonly _cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new Error(`Money must be an integer number of satang, got ${cents}`)
    }
    if (cents < 0) {
      throw new Error(`Money cannot be negative, got ${cents}`)
    }
    return new Money(cents)
  }

  static fromBaht(baht: number): Money {
    return Money.fromCents(Math.round(baht * 100))
  }

  static parseBaht(input: string): Money | null {
    if (input.trim().length === 0) {
      return null
    }
    const baht = Number(input)
    if (!Number.isFinite(baht)) {
      return null
    }
    const cents = Math.round(baht * 100)
    if (cents < 0) {
      return null
    }
    return Money.fromCents(cents)
  }

  get cents(): number {
    return this._cents
  }

  toBaht(): number {
    return this._cents / 100
  }

  add(other: Money): Money {
    return Money.fromCents(this._cents + other._cents)
  }

  subtract(other: Money): Money {
    return Money.fromCents(this._cents - other._cents)
  }

  multiply(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error(`Quantity must be a non-negative integer, got ${quantity}`)
    }
    return Money.fromCents(this._cents * quantity)
  }

  format(): string {
    return `฿${this.toBaht().toFixed(2)}`
  }

  equals(other: Money): boolean {
    return this._cents === other._cents
  }
}
