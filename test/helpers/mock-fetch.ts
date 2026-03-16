import sinon from 'sinon'

const API_BASE = 'https://api-admin.adapty.io/api/v1/developer'

export const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
export const TEST_RESOURCE_ID = '660e8400-e29b-41d4-a716-446655440001'

export const EMPTY_LIST_RESPONSE = {data: [], meta: {pagination: {count: 0, page: 1, pages: 1}}}

export function mockFetch(responses: unknown[] = [{}]): sinon.SinonStub {
  let callIndex = 0
  const stub = sinon.stub(globalThis, 'fetch').callsFake(async () => {
    const body = responses[callIndex] ?? responses.at(-1)
    callIndex++
    return new Response(JSON.stringify(body), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    })
  })
  return stub
}

export function restoreFetch(stub: sinon.SinonStub): void {
  stub.restore()
}

interface AssertFetchOpts {
  body?: Record<string, unknown>
  callIndex: number
  method: string
  path: string
  stub: sinon.SinonStub
}

export function assertFetch({body, callIndex, method, path, stub}: AssertFetchOpts): void {
  const call = stub.getCall(callIndex)
  const url = call.args[0] as string
  const init = call.args[1] as {body?: string; method: string}

  const urlPath = url.replace(API_BASE, '').split('?')[0]
  if (urlPath !== path) {
    throw new Error(`Expected path "${path}", got "${urlPath}"`)
  }

  if (init.method !== method) {
    throw new Error(`Expected method "${method}", got "${init.method}"`)
  }

  if (body) {
    const actual = JSON.parse(init.body as string)
    for (const [key, value] of Object.entries(body)) {
      const actualVal = actual[key]
      if (JSON.stringify(actualVal) !== JSON.stringify(value)) {
        throw new Error(`Body key "${key}": expected ${JSON.stringify(value)}, got ${JSON.stringify(actualVal)}`)
      }
    }
  }
}
