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

const PLACEMENT_RESPONSE = {developer_id: 'default', id: TEST_RESOURCE_ID, title: 'Default'}
const PAYWALL_ID = '770e8400-e29b-41d4-a716-446655440002'
const SEGMENT_ID = '880e8400-e29b-41d4-a716-446655440003'

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
    fetchStub = mockFetch([
      {
        ...PLACEMENT_RESPONSE,
        audiences: [{paywall_id: PAYWALL_ID, priority: 0, segment_ids: []}],
      },
    ])
    await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('create with --paywall-id sends paywall_id directly', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    await runCommand(`placements create --app ${TEST_APP_ID} --title Default --developer-id default --paywall-id ${PAYWALL_ID}`)
    assertFetch({
      body: {
        audiences: null,
        developer_id: 'default',
        paywall_id: PAYWALL_ID,
        title: 'Default',
      },
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/placements/`,
      stub: fetchStub,
    })
  })

  it('create with --audiences sends JSON verbatim', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    const audiences = [
      {paywall_id: PAYWALL_ID, priority: 0, segment_ids: [SEGMENT_ID]},
      {paywall_id: PAYWALL_ID, priority: 1, segment_ids: []},
    ]
    await runCommand([
      'placements',
      'create',
      '--app',
      TEST_APP_ID,
      '--title',
      'Default',
      '--developer-id',
      'default',
      '--audiences',
      JSON.stringify(audiences),
    ])
    assertFetch({
      body: {audiences, developer_id: 'default', paywall_id: null, title: 'Default'},
      callIndex: 0,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/placements/`,
      stub: fetchStub,
    })
  })

  it('update with --paywall-id sends paywall_id directly', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    await runCommand(`placements update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --title Default --developer-id default --paywall-id ${PAYWALL_ID}`)
    assertFetch({
      body: {
        audiences: null,
        developer_id: 'default',
        paywall_id: PAYWALL_ID,
        title: 'Default',
      },
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })

  it('update with --audiences sends JSON verbatim', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    const audiences = [{paywall_id: PAYWALL_ID, priority: 0, segment_ids: []}]
    await runCommand([
      'placements',
      'update',
      TEST_RESOURCE_ID,
      '--app',
      TEST_APP_ID,
      '--title',
      'Default',
      '--developer-id',
      'default',
      '--audiences',
      JSON.stringify(audiences),
    ])
    assertFetch({
      body: {audiences, developer_id: 'default', paywall_id: null, title: 'Default'},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })
})
