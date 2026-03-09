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

const PAYWALL_RESPONSE = {id: TEST_RESOURCE_ID, name: 'Default Paywall'}

describe('paywalls', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/paywalls', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`paywalls list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/paywalls/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{...PAYWALL_RESPONSE, product_ids: []}])
    await runCommand(`paywalls get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps/{app}/paywalls', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PAYWALL_RESPONSE])
    await runCommand(`paywalls create --app ${TEST_APP_ID} --name "Default Paywall" --product-id ${TEST_RESOURCE_ID}`)
    assertFetch({
      body: {name: 'Default Paywall', product_ids: [TEST_RESOURCE_ID]},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/paywalls/`,
      stub: fetchStub,
    })
  })

  it('update calls PUT /apps/{app}/paywalls/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PAYWALL_RESPONSE])
    await runCommand(`paywalls update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --name "Default Paywall" --product-id ${TEST_RESOURCE_ID}`)
    assertFetch({
      body: {name: 'Default Paywall', product_ids: [TEST_RESOURCE_ID]},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/paywalls/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
