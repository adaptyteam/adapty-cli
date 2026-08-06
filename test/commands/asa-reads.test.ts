import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import sinon from 'sinon'

import {
  ASA_API_BASE,
  assertFetch,
  EMPTY_LIST_RESPONSE,
  mockFetch,
  restoreFetch,
  TEST_APP_ID,
  TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js'

const PERIOD = {date_from: '2026-07-01', date_to: '2026-07-31'}

describe('asa reads', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('campaigns list asks for metadata only, with no reporting window', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa campaigns list')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/campaigns/', stub: fetchStub})
    const {searchParams} = new URL(fetchStub.getCall(0).args[0] as string)
    expect(searchParams.has('date_from')).to.be.false
    expect(searchParams.has('date_to')).to.be.false
  })

  it('campaigns list no longer accepts the period flags', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    const {error} = await runCommand('asa campaigns list --date-from 2026-07-01')
    expect(error?.message).to.contain('--date-from')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('search-terms list still forwards the reporting window', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa search-terms list --date-from 2026-07-01 --date-to 2026-07-31')
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: '/search-terms/',
      query: PERIOD,
      stub: fetchStub,
    })
  })

  it('keywords list scopes the read to one ad group and one status', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`asa keywords list --ad-group ${TEST_RESOURCE_ID} --campaign ${TEST_APP_ID} --status ACTIVE`)
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: '/keywords/',
      query: {ad_group_id: TEST_RESOURCE_ID, campaign_id: TEST_APP_ID, status: 'ACTIVE'},
      stub: fetchStub,
    })
  })

  it('a repeated id filter travels as repeated query params', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand(`asa ads list --ad-group ${TEST_RESOURCE_ID} --ad-group ${TEST_APP_ID}`)
    const url = fetchStub.getCall(0).args[0] as string
    expect(new URL(url).searchParams.getAll('ad_group_id')).to.deep.equal([TEST_RESOURCE_ID, TEST_APP_ID])
  })

  it('a filter id that is not a UUID is refused before the call', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    const {error} = await runCommand('asa creatives list --app not-a-uuid')
    expect(error?.message).to.contain('UUIDs printed by the matching list command')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('search-terms list rejects a malformed date before calling anything', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    const {error} = await runCommand('asa search-terms list --date-from 01-07-2026')
    expect(error?.message).to.contain('YYYY-MM-DD')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('campaigns get asks for one campaign', async () => {
    fetchStub = mockFetch([{internal_id: TEST_RESOURCE_ID, name: 'Winter push'}])
    await runCommand(`asa campaigns get ${TEST_RESOURCE_ID}`)
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: `/campaigns/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('campaigns get refuses a non-UUID id without a request', async () => {
    fetchStub = mockFetch([{}])
    const {error} = await runCommand('asa campaigns get not-a-uuid')
    expect(error?.message).to.contain('Invalid campaign ID')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('ad-groups list and get hit their paths', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE, {internal_id: TEST_RESOURCE_ID}])
    await runCommand('asa ad-groups list')
    await runCommand(`asa ad-groups get ${TEST_RESOURCE_ID}`)
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/ad-groups/', stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 1, method: 'GET', path: `/ad-groups/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('keywords, search terms and negative keywords list from their own paths', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa keywords list')
    await runCommand('asa search-terms list')
    await runCommand('asa negative-keywords list')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/keywords/', stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 1, method: 'GET', path: '/search-terms/', stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 2, method: 'GET', path: '/negative-keywords/', stub: fetchStub})
  })

  it('ads list surfaces why an ad is not serving', async () => {
    fetchStub = mockFetch([
      {
        data: [{internal_id: TEST_RESOURCE_ID, name: 'Summer ad', serving_state_reasons: ['CREATIVE_PENDING_REVIEW'], serving_status: 'NOT_RUNNING'}],
        meta: {pagination: {count: 1, page: 1, pages: 1}},
      },
    ])
    const {stdout} = await runCommand('asa ads list')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/ads/', stub: fetchStub})
    expect(stdout).to.contain('CREATIVE_PENDING_REVIEW')
  })

  it('ads get, product-pages and creatives lists hit their paths', async () => {
    fetchStub = mockFetch([{internal_id: TEST_RESOURCE_ID}, EMPTY_LIST_RESPONSE, EMPTY_LIST_RESPONSE])
    await runCommand(`asa ads get ${TEST_RESOURCE_ID}`)
    await runCommand('asa product-pages list')
    await runCommand('asa creatives list')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: `/ads/${TEST_RESOURCE_ID}/`, stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 1, method: 'GET', path: '/product-pages/', stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 2, method: 'GET', path: '/creatives/', stub: fetchStub})
  })

  it('automations list, get and runs hit their paths', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE, {id: TEST_RESOURCE_ID, name: 'rule'}, EMPTY_LIST_RESPONSE])
    await runCommand('asa automations list')
    await runCommand(`asa automations get ${TEST_RESOURCE_ID}`)
    await runCommand(`asa automations runs ${TEST_RESOURCE_ID}`)
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/automations/', stub: fetchStub})
    assertFetch({base: ASA_API_BASE, callIndex: 1, method: 'GET', path: `/automations/${TEST_RESOURCE_ID}/`, stub: fetchStub})
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 2,
      method: 'GET',
      path: `/automations/${TEST_RESOURCE_ID}/runs/`,
      stub: fetchStub,
    })
  })

  it('paginates every list the same way', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa keywords list --page 3 --page-size 100')
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: '/keywords/',
      query: {'page[number]': '3', 'page[size]': '100'},
      stub: fetchStub,
    })
  })

  it('refuses a page size above the server cap', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    const {error} = await runCommand('asa keywords list --page-size 500')
    expect(error?.message).to.contain('100')
    expect(fetchStub.callCount).to.equal(0)
  })
})
