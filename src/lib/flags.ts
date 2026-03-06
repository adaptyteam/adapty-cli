import {Flags} from '@oclif/core'

const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

export const appFlag = {
  app: Flags.string({
    description: 'App ID (UUID)',
    async parse(input) {
      if (!isValidUuid(input)) {
        throw new Error('Invalid app ID format. Run `adapty apps list` to find your app ID.')
      }

      return input
    },
    required: true,
  }),
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {pagination: {count: number; page: number; pages: number}}
}

export const paginationFlags = {
  page: Flags.integer({
    default: 1,
    description: 'Page number',
    min: 1,
  }),
  'page-size': Flags.integer({
    default: 20,
    description: 'Items per page (max 100)',
    max: 100,
    min: 1,
  }),
}

export function paginationParams(flags: {page: number; 'page-size': number}): Record<string, string> {
  return {
    'page[number]': String(flags.page),
    'page[size]': String(flags['page-size']),
  }
}
