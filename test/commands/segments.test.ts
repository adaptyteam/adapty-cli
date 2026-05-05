import {runCommand} from '@oclif/test'
import sinon from 'sinon'

import {
  assertFetch,
  EMPTY_LIST_RESPONSE,
  mockFetch,
  restoreFetch,
  TEST_APP_ID,
  TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js'

const SEGMENT_RESPONSE = {description: 'High-value users', segment_id: TEST_RESOURCE_ID, title: 'VIP'}

describe('segments', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/segments', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`segments list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/segments/`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/segments/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([SEGMENT_RESPONSE])
    await runCommand(`segments get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({
      callIndex: 0,
      method: 'GET',
      path: `/apps/${TEST_APP_ID}/segments/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
