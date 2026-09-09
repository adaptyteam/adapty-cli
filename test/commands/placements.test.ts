import {runCommand} from '@oclif/test'
import sinon from 'sinon'

import {
  assertFetch,
  mockFetch,
  mockFetchFailure,
  restoreFetch,
  TEST_APP_ID,
  TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js'

const PLACEMENT_RESPONSE = {developer_id: 'default', id: TEST_RESOURCE_ID, is_active: true, title: 'Default'}
const PAYWALL_ID = '770e8400-e29b-41d4-a716-446655440002'
const SEGMENT_ID = '880e8400-e29b-41d4-a716-446655440003'
const FLOW_ID = '990e8400-e29b-41d4-a716-446655440004'

describe('placements', () => {
  let fetchStub: sinon.SinonStub

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('list calls GET /apps/{app}/placements and surfaces is_active', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([
      {data: [{...PLACEMENT_RESPONSE, is_active: false}], meta: {pagination: {count: 1, page: 1, pages: 1}}},
    ])
    const {stdout} = await runCommand(`placements list --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/`, stub: fetchStub})
    if (!stdout.includes('Is Active: false')) throw new Error(`Expected "Is Active: false" in output, got: ${stdout}`)
  })

  it('get calls GET /apps/{app}/placements/{id} and surfaces is_active', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([
      {
        ...PLACEMENT_RESPONSE,
        audiences: [{content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: []}],
      },
    ])
    const {stdout} = await runCommand(`placements get ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    assertFetch({callIndex: 0, method: 'GET', path: `/apps/${TEST_APP_ID}/placements/${TEST_RESOURCE_ID}/`, stub: fetchStub})
    if (!stdout.includes('Is Active: true')) throw new Error(`Expected "Is Active: true" in output, got: ${stdout}`)
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
      {content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: [SEGMENT_ID]},
      {content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 1, segment_ids: []},
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

  it('create with a flow audience sends content_type and flow_id', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    const audiences = [{content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: []}]
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

  it('update with a flow audience sends content_type and flow_id', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    const audiences = [{content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: []}]
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

  it('create rejects an audience entry without content_type and makes no HTTP call', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([PLACEMENT_RESPONSE])
    const audiences = [{paywall_id: PAYWALL_ID, priority: 0, segment_ids: []}]
    const {error} = await runCommand([
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
    const exit = (error as undefined | {oclif?: {exit?: number}})?.oclif?.exit
    if (exit !== 2) throw new Error(`Expected exit code 2, got ${exit}`)
    if (fetchStub.callCount !== 0) throw new Error(`Expected no HTTP call, got ${fetchStub.callCount}`)
  })

  it('create enriches the draft-flow 400 with publish steps and the flow id', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetchFailure(
      {
        error_code: 'validation_error',
        errors: {non_field_errors: ['Flow must be published before placing in a placement.']},
        status_code: 400,
      },
      {status: 400},
    )
    const audiences = [{content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: []}]
    const {error} = await runCommand([
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
    const exit = (error as undefined | {oclif?: {exit?: number}})?.oclif?.exit
    if (exit === 0 || exit === undefined) throw new Error(`Expected non-zero exit, got ${exit}`)
    const {message} = error as Error
    for (const needle of [
      `adapty flows publish --app ${TEST_APP_ID} ${FLOW_ID}`,
      `https://app.adapty.io/flows/${FLOW_ID}/builder`,
      'https://adapty.io/docs/flow-generator-skill',
    ]) {
      if (!message.includes(needle)) throw new Error(`Expected "${needle}" in error, got: ${message}`)
    }
  })

  it('create relays a different 400 unchanged, with no publish steps', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetchFailure(
      {
        error_code: 'validation_error',
        errors: {audiences: ['Audiences must not mix flow and paywall content types.']},
        status_code: 400,
      },
      {status: 400},
    )
    const audiences = [{content_type: 'flow', flow_id: FLOW_ID, priority: 0, segment_ids: []}]
    const {error} = await runCommand([
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
    if (error === undefined) throw new Error('Expected the command to fail')
    const {message} = error as Error
    if (message.includes('adapty flows publish')) throw new Error(`Expected no publish steps, got: ${message}`)
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
    const audiences = [{content_type: 'paywall', paywall_id: PAYWALL_ID, priority: 0, segment_ids: []}]
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
