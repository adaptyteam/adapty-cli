import {runCommand} from '@oclif/test'
import sinon from 'sinon'

import {
  assertFetch,
  EMPTY_LIST_RESPONSE,
  mockFetch,
  restoreFetch,
  TEST_APP_ID,
} from '../helpers/mock-fetch.js'

describe('apps', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('apps list')
    assertFetch({callIndex: 0, method: 'GET', path: '/apps/', stub: fetchStub})
  })

  it('get calls GET /apps/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{id: TEST_APP_ID, name: 'My App', platforms: [], sdk_key: 'sdk_key', secret_key: 'secret'}])
    await runCommand(`apps get ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{app: {id: TEST_APP_ID, name: 'My App', sdk_key: 'sdk_key'}, default_access_level: {id: 'al-id', sdk_id: 'premium'}}])
    await runCommand('apps create --name "My App" --platform ios --ios-bundle-id com.example.app')
    assertFetch({body: {app_name: 'My App', ios_bundle_id: 'com.example.app', platforms: ['ios']}, callIndex: 0, method: 'POST', path: '/apps/', stub: fetchStub})
  })

  it('update calls PUT /apps/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{id: TEST_APP_ID, name: 'Updated'}])
    await runCommand(`apps update ${TEST_APP_ID} --name "Updated"`)
    assertFetch({body: {name: 'Updated'}, callIndex: 0, method: 'PUT', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub})
  })
})
