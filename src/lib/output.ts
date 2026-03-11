const UPPER_WORDS = new Set(['api', 'id', 'ios', 'sdk', 'uri', 'url', 'uuid'])

function formatLabel(snakeKey: string): string {
  return snakeKey
    .split('_')
    .map((w) => {
      if (w === 'ids') return 'IDs'
      if (UPPER_WORDS.has(w)) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function formatValue(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v !== null ? formatValue(v, indent) : String(v))).join(', ')
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${indent}  ${formatLabel(k)}: ${formatValue(v, indent + '  ')}`)
      .join('\n')
  }

  return String(value)
}

export function printResponse(data: Record<string, unknown>, log: (msg: string) => void): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      log(`${formatLabel(key)}:`)
      log(formatValue(value))
    } else {
      log(`${formatLabel(key)}: ${formatValue(value)}`)
    }
  }
}

export function printList(
  items: Record<string, unknown>[],
  log: (msg: string) => void,
  pagination?: {count: number; page: number; pages: number},
): void {
  for (const [i, item] of items.entries()) {
    printResponse(item, log)
    if (i < items.length - 1) log('---')
  }

  if (pagination) {
    log('')
    log(`Page ${pagination.page} of ${pagination.pages} (${pagination.count} total)`)
  }
}
