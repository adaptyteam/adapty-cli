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

function isScalar(value: unknown): boolean {
  return typeof value !== 'object' || value === null
}

function renderArrayItems(items: unknown[], indent: string): string[] {
  const childIndent = indent + '  '
  const lines: string[] = []
  for (const item of items) {
    if (item === undefined || item === null) continue
    if (Array.isArray(item)) {
      lines.push(...renderArrayItems(item, childIndent))
    } else if (isScalar(item)) {
      lines.push(`${indent}- ${String(item)}`)
    } else {
      const rendered = renderObject(item as Record<string, unknown>, childIndent)
      if (rendered.length === 0) continue
      lines.push(`${indent}- ${rendered[0].slice(childIndent.length)}`, ...rendered.slice(1))
    }
  }

  return lines
}

function renderObject(data: Record<string, unknown>, indent: string): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const label = `${indent}${formatLabel(key)}:`
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      if (value.every((v) => isScalar(v))) {
        lines.push(`${label} ${value.map(String).join(', ')}`)
      } else {
        lines.push(label, ...renderArrayItems(value, indent + '  '))
      }
    } else if (isScalar(value)) {
      lines.push(`${label} ${String(value)}`)
    } else {
      const nested = renderObject(value as Record<string, unknown>, indent + '  ')
      if (nested.length > 0) lines.push(label, ...nested)
    }
  }

  return lines
}

export function printResponse(data: Record<string, unknown>, log: (msg: string) => void): void {
  for (const line of renderObject(data, '')) log(line)
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
