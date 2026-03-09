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

const PRODUCT_RESPONSE = {id: TEST_RESOURCE_ID, name: 'Monthly', vendor_products: {}}

describe('products', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/products', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`products list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/products/`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/products/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{...PRODUCT_RESPONSE, access_level_id: 'al', period: 'monthly'}])
    await runCommand(`products get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps/{app}/products', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    await runCommand(`products create --app ${TEST_APP_ID} --name Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --ios-product-id com.example.monthly`)
    assertFetch({
      body: {access_level_id: TEST_RESOURCE_ID, ios_product_id: 'com.example.monthly', name: 'Monthly', period: 'monthly'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/products/`,
      stub: fetchStub,
    })
  })

  it('update calls PUT /apps/{app}/products/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --name Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --ios-product-id com.example.monthly`)
    assertFetch({
      body: {access_level_id: TEST_RESOURCE_ID, ios_product_id: 'com.example.monthly', name: 'Monthly', period: 'monthly'},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
