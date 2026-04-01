import {ApiError, NetworkError} from '../errors.js'

export function ok(data: unknown): {content: [{type: 'text'; text: string}]} {
  return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}]}
}

export function fail(err: unknown): {content: [{type: 'text'; text: string}]; isError: true} {
  const text = err instanceof ApiError || err instanceof NetworkError ? err.toHuman() : String(err)
  return {content: [{type: 'text', text}], isError: true}
}

export function paginationParams(page?: number, pageSize?: number): Record<string, string> {
  const params: Record<string, string> = {}
  if (page) params['page[number]'] = String(page)
  if (pageSize) params['page[size]'] = String(pageSize)
  return params
}
