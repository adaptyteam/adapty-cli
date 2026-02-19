import {Flags} from '@oclif/core'

export const appFlag = {
  app: Flags.string({
    description: 'App ID (UUID)',
    required: true,
  }),
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
