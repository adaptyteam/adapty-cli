export function printKeyValue(data: Record<string, unknown>, log: (msg: string) => void): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      log(`${key}: ${String(value)}`)
    }
  }
}

export function printList(
  items: Record<string, unknown>[],
  log: (msg: string) => void,
  pagination?: {count: number; page: number; pages: number},
): void {
  for (const [i, item] of items.entries()) {
    printKeyValue(item, log)
    if (i < items.length - 1) log('---')
  }

  if (pagination) {
    log('')
    log(`Page ${pagination.page} of ${pagination.pages} (${pagination.count} total)`)
  }
}

const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}
