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

const PLACEMENT_RESPONSE = {developer_id: 'default', id: TEST_RESOURCE_ID, name: 'Default'}
const PAYWALL_ID = '770e8400-e29b-41d4-a716-446655440002'

describe('placements', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/placements', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`placements list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/`, stub: fetchStub})
  })

  it('get calls GET /apps/{app}/placements/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{...PLACEMENT_RESPONSE, paywall_id: PAYWALL_ID}])
    await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('create calls POST /apps/{app}/placements', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    await runCommand(`placements create --app ${TEST_APP_ID} --name Default --developer-id default --paywall-id ${PAYWALL_ID}`)
    assertFetch({
      body: {developer_id: 'default', name: 'Default', paywall_id: PAYWALL_ID},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/placements/`,
      stub: fetchStub,
    })
  })

  it('update calls PUT /apps/{app}/placements/{id}', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    await runCommand(`placements update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --name Default --developer-id default --paywall-id ${PAYWALL_ID}`)
    assertFetch({
      body: {developer_id: 'default', name: 'Default', paywall_id: PAYWALL_ID},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
