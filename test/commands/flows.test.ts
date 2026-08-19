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

const FLOW_RESPONSE = {id: TEST_RESOURCE_ID, name: 'Onboarding', status: 'draft', updated_at: '2026-08-12T10:30:00Z'}
const CONFIG_RESPONSE = {
  config: {locales: [{code: 'en'}], screens: [{id: 'welcome'}]},
  remote_configs: [],
  status: 'draft',
  updated_at: 1_755_001_800_000,
}

describe('flows', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/flows', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`flows list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/flows/`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/flows/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([FLOW_RESPONSE])
    await runCommand(`flows get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps/{app}/flows', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([FLOW_RESPONSE])
    await runCommand(`flows create --app ${TEST_APP_ID} --name "Onboarding"`)
    assertFetch({
      body: {name: 'Onboarding'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/flows/`,
      stub: fetchStub,
    })
  })

  it('config get calls GET /apps/{app}/flows/{id}/config', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([CONFIG_RESPONSE])
    await runCommand(`flows config get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({
      callIndex: 0,
      method: 'GET',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
      stub: fetchStub,
    })
  })

  it('config update calls PUT /apps/{app}/flows/{id}/config with the inline config', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([CONFIG_RESPONSE])
    await runCommand([
      'flows',
      'config',
      'update',
      TEST_RESOURCE_ID,
      '--app',
      TEST_APP_ID,
      '--config',
      '{"locales":[],"screens":[]}',
    ])
    assertFetch({
      body: {config: {locales: [], screens: []}},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
      stub: fetchStub,
    })
  })

  it('config validate POSTs to /config/validate with the source header', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{issues: [], valid: true}])
    await runCommand([
      'flows',
      'config',
      'validate',
      TEST_RESOURCE_ID,
      '--app',
      TEST_APP_ID,
      '--config',
      '{"locales":[],"screens":[]}',
      '--source',
      'byo-cli',
    ])
    assertFetch({
      body: {config: {locales: [], screens: []}},
      callIndex: 0,
      headers: {'X-Adapty-Source': 'byo-cli'},
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/validate/`,
      stub: fetchStub,
    })
  })

  it('config validate exits non-zero when the config is not publishable', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{issues: [{message: 'missing screens', severity: 'error'}], valid: false}])
    await runCommand(`flows config validate ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --config {"screens":[]}`)
    if (process.exitCode !== 1) {
      throw new Error(`Expected exit code 1, got ${process.exitCode}`)
    }

    process.exitCode = 0
  })

  it('config update forwards remote-configs and the optimistic lock token', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([CONFIG_RESPONSE])
    await runCommand([
      'flows',
      'config',
      'update',
      TEST_RESOURCE_ID,
      '--app',
      TEST_APP_ID,
      '--config',
      '{"screens":[]}',
      '--remote-configs',
      '[{"data":"{}","locale":"en"}]',
      '--expected-updated-at',
      '1755001800000',
    ])
    assertFetch({
      body: {
        config: {screens: []},
        expected_updated_at: 1_755_001_800_000,
        remote_configs: [{data: '{}', locale: 'en'}],
      },
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/config/`,
      stub: fetchStub,
    })
  })
})
