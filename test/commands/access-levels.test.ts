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

const ACCESS_LEVEL_RESPONSE = {id: TEST_RESOURCE_ID, sdk_id: 'premium', title: 'Premium'}

describe('access-levels', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/access-levels', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`access-levels list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/access-levels`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/access-levels/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([ACCESS_LEVEL_RESPONSE])
    await runCommand(`access-levels get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/access-levels/${TEST_RESOURCE_ID}`, stub: fetchStub})
  })

  it('create calls POST /apps/{app}/access-levels', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([ACCESS_LEVEL_RESPONSE])
    await runCommand(`access-levels create --app ${TEST_APP_ID} --sdk-id premium --title Premium`)
    assertFetch({
      body: {sdk_id: 'premium', title: 'Premium'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/access-levels`,
      stub: fetchStub,
    })
  })

  it('update calls PUT /apps/{app}/access-levels/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([ACCESS_LEVEL_RESPONSE])
    await runCommand(`access-levels update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Premium`)
    assertFetch({
      body: {title: 'Premium'},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/access-levels/${TEST_RESOURCE_ID}`,
      stub: fetchStub,
    })
  })
})
