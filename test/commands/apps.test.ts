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
    fetchStub = mockFetch([{id: TEST_APP_ID, platforms: [], sdk_key: 'sdk_key', secret_key: 'secret', title: 'My App'}])
    await runCommand(`apps get ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps then GET access-levels', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([
      {id: TEST_APP_ID, sdk_key: 'sdk_key', title: 'My App'},
      {items: [{id: 'al-id', sdk_id: 'premium', title: 'Premium'}]},
    ])
    await runCommand('apps create --title "My App" --platform ios --apple-bundle-id com.example.app')
    assertFetch({body: {apple_bundle_id: 'com.example.app', platforms: ['ios'], title: 'My App'}, callIndex: 0, method: 'POST', path: '/apps/', stub: fetchStub})
    assertFetch({callIndex: 1, method: 'GET', path: `/apps/${TEST_APP_ID}/access-levels/`, stub: fetchStub})
  })

  it('update calls PUT /apps/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{id: TEST_APP_ID, title: 'Updated'}])
    await runCommand(`apps update ${TEST_APP_ID} --title "Updated"`)
    assertFetch({body: {title: 'Updated'}, callIndex: 0, method: 'PUT', path: `/apps/${TEST_APP_ID}/`, stub: fetchStub})
  })
})
