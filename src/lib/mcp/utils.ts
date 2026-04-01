import {ApiError, NetworkError} from '../errors.js'

export function ok(data: unknown): {content: [{type: 'text'; text: string}]} {
  return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}]}
}

export function fail(err: unknown): {content: [{type: 'text'; text: string}]; isError: true} {
  let text: string
  if (err instanceof ApiError || err instanceof NetworkError) {
    text = err.toHuman()
  } else if (err instanceof Error) {
    text = err.message
  } else {
    text = String(err)
  }
  return {content: [{type: 'text', text}], isError: true}
}

export function paginationParams(page?: number, pageSize?: number): Record<string, string> {
  const params: Record<string, string> = {}
  if (page !== undefined) params['page[number]'] = String(page)
  if (pageSize !== undefined) params['page[size]'] = String(pageSize)
  return params
}
