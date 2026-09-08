function escapeCsvField(value: string): string {
  // Neutralize spreadsheet formula injection: a field a spreadsheet would
  // evaluate gets a leading apostrophe, which Excel/LibreOffice treat as
  // "this is text".
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}
