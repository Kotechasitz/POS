import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with commas and CRLF line endings', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv).toBe('A,B\r\n1,2\r\n3,4')
  })

  it('leaves a plain field unquoted', () => {
    expect(toCsv(['H'], [['plain']])).toBe('H\r\nplain')
  })

  it('quotes a field containing a comma', () => {
    expect(toCsv(['H'], [['a,b']])).toBe('H\r\n"a,b"')
  })

  it('quotes a field containing a double-quote, doubling the internal quote', () => {
    expect(toCsv(['H'], [['say "hi"']])).toBe('H\r\n"say ""hi"""')
  })

  it('quotes a field containing a line break', () => {
    expect(toCsv(['H'], [['line1\nline2']])).toBe('H\r\n"line1\nline2"')
  })

  it('quotes a field containing both a comma and a quote together', () => {
    expect(toCsv(['H'], [['Chips, "BBQ" flavor']])).toBe('H\r\n"Chips, ""BBQ"" flavor"')
  })

  it('handles an empty rows array, producing just the header line', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B')
  })

  it('prefixes a field starting with "=" with a leading apostrophe to prevent formula injection', () => {
    expect(toCsv(['H'], [['=SUM(A1:A9)']])).toBe("H\r\n'=SUM(A1:A9)")
  })

  it('prefixes a field starting with "+" with a leading apostrophe to prevent formula injection', () => {
    expect(toCsv(['H'], [['+1234']])).toBe("H\r\n'+1234")
  })

  it('prefixes a field starting with "-" with a leading apostrophe to prevent formula injection', () => {
    expect(toCsv(['H'], [['-1234']])).toBe("H\r\n'-1234")
  })

  it('prefixes a field starting with "@" with a leading apostrophe to prevent formula injection', () => {
    expect(toCsv(['H'], [['@SUM(1)']])).toBe("H\r\n'@SUM(1)")
  })

  it('leaves a normal field with no leading special character untouched', () => {
    expect(toCsv(['H'], [['Coke Zero']])).toBe('H\r\nCoke Zero')
  })
})
