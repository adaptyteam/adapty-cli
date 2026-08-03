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

const PRODUCT_RESPONSE = {id: TEST_RESOURCE_ID, title: 'Monthly', vendor_products: {}}

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
    await runCommand(`products create --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --ios-product-id com.example.monthly`)
    assertFetch({
      body: {access_level_id: TEST_RESOURCE_ID, ios_product_id: 'com.example.monthly', period: 'monthly', title: 'Monthly'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/products/`,
      stub: fetchStub,
    })
  })

  it('create maps Stripe bindings to the POST body', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    await runCommand(`products create --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --stripe-product-id prod_x --stripe-price-id price_x`)
    assertFetch({
      body: {stripe_price_id: 'price_x', stripe_product_id: 'prod_x'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/products/`,
      stub: fetchStub,
    })
  })

  it('create maps Paddle bindings to the POST body', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    await runCommand(`products create --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --paddle-product-id pro_x --paddle-price-id pri_x`)
    assertFetch({
      body: {paddle_price_id: 'pri_x', paddle_product_id: 'pro_x'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/products/`,
      stub: fetchStub,
    })
  })

  it('create rejects a lone --stripe-product-id without a fetch', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    const {error} = await runCommand(`products create --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID} --period monthly --stripe-product-id prod_x`)
    if (fetchStub.called) throw new Error('expected no fetch call')
    if (!error) throw new Error('expected command to error')
  })

  it('update calls PUT /apps/{app}/products/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PRODUCT_RESPONSE])
    await runCommand(`products update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Monthly --access-level-id ${TEST_RESOURCE_ID}`)
    assertFetch({
      body: {access_level_id: TEST_RESOURCE_ID, title: 'Monthly'},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
