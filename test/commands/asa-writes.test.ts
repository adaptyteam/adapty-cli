import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sinon from 'sinon'

import {
  ASA_API_BASE,
  assertFetch,
  mockFetch,
  mockFetchFailure,
  restoreFetch,
  TEST_APP_ID,
  TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js'

const CAMPAIGN_OK = {campaign: {campaign_id: 777, internal_id: TEST_RESOURCE_ID, name: 'Winter push', status: 'ENABLED'}, errors: []}
const AD_GROUP_OK = {ad_group: {internal_id: TEST_RESOURCE_ID, name: 'Brand terms'}, errors: []}
const AD_OK = {ad: {internal_id: TEST_RESOURCE_ID, name: 'Summer ad'}, errors: []}
const KEYWORDS_OK = {errors: [], is_validation_failure: false, keywords: [{internal_id: TEST_RESOURCE_ID, text: 'running shoes'}]}
const NEGATIVES_OK = {errors: [], is_validation_failure: false, negative_keywords: [{internal_id: TEST_RESOURCE_ID, text: 'free'}]}

describe('asa writes', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('campaigns create sends the flat body with money objects', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    await runCommand(
      `asa campaigns create --yes --org ${TEST_APP_ID} --name "Winter push" --adam-id 123456 --country US --country GB --daily-budget 50`,
    )
    assertFetch({
      base: ASA_API_BASE,
      body: {
        ad_channel_type: 'SEARCH',
        adam_id: 123_456,
        billing_event: 'TAPS',
        campaign_group_id: TEST_APP_ID,
        countries_or_regions: ['US', 'GB'],
        daily_budget_amount: {amount: '50', currency: 'USD'},
        name: 'Winter push',
        supply_sources: ['APPSTORE_SEARCH_RESULTS'],
      },
      callIndex: 0,
      method: 'POST',
      path: '/campaigns/',
      stub: fetchStub,
    })
  })

  it('refuses to write from a script unless --yes is passed', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    const {stderr} = await runCommand(
      `asa campaigns create --json --org ${TEST_APP_ID} --name x --adam-id 1 --country US --daily-budget 50`,
    )
    expect(stderr).to.contain('--yes')
    expect(stderr).to.contain('POST /campaigns/')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('campaigns create refuses an amount that is not a number', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    const {error} = await runCommand(
      `asa campaigns create --yes --org ${TEST_APP_ID} --name x --adam-id 1 --country US --daily-budget 50usd --budget abc`,
    )
    expect(error?.message).to.contain('plain numbers')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('campaigns carry target CPA and bidding strategy when asked', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK, CAMPAIGN_OK])
    await runCommand(
      `asa campaigns create --yes --org ${TEST_APP_ID} --name x --adam-id 1 --country US --daily-budget 50 --target-cpa 3.50 --bidding-strategy MAX_CONVERSIONS`,
    )
    const created = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(created.target_cpa).to.deep.equal({amount: '3.50', currency: 'USD'})
    expect(created.bidding_strategy).to.equal('MAX_CONVERSIONS')

    await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --target-cpa 2`)
    const updated = JSON.parse(fetchStub.getCall(1).args[1].body as string)
    expect(updated).to.deep.equal({target_cpa: {amount: '2', currency: 'USD'}})
  })

  it('campaigns update sends only the mentioned fields', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body).to.deep.equal({status: 'PAUSED'})
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'PUT', path: `/campaigns/${TEST_RESOURCE_ID}/`, stub: fetchStub})
  })

  it('campaigns update refuses an empty change without a request', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    const {error} = await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID}`)
    expect(error?.message).to.contain('Nothing to change')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('ad-groups create and update carry only their own fields', async () => {
    fetchStub = mockFetch([AD_GROUP_OK, AD_GROUP_OK])
    await runCommand(`asa ad-groups create --yes --campaign ${TEST_RESOURCE_ID} --name "Brand terms" --default-bid 1.20`)
    await runCommand(`asa ad-groups update --yes ${TEST_RESOURCE_ID} --default-bid 1.50`)
    const createBody = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(createBody).to.deep.include({
      campaign_id: TEST_RESOURCE_ID,
      default_bid_amount: {amount: '1.20', currency: 'USD'},
      name: 'Brand terms',
    })
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'POST', path: '/ad-groups/', stub: fetchStub})
    const updateBody = JSON.parse(fetchStub.getCall(1).args[1].body as string)
    expect(updateBody).to.deep.equal({default_bid_amount: {amount: '1.50', currency: 'USD'}})
  })

  it('ad-groups create supplies what Apple demands: a pricing model and a start time', async () => {
    fetchStub = mockFetch([AD_GROUP_OK, AD_GROUP_OK])
    await runCommand(`asa ad-groups create --yes --campaign ${TEST_RESOURCE_ID} --name AG --default-bid 1`)
    const defaults = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(defaults.pricing_model).to.equal('CPC')
    expect(defaults.start_time).to.match(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/)
    expect(defaults.end_time).to.equal(undefined)

    await runCommand(
      `asa ad-groups create --yes --campaign ${TEST_RESOURCE_ID} --name AG --default-bid 1 --pricing-model CPM --start-time 2026-09-01 --end-time 2026-09-30`,
    )
    const explicit = JSON.parse(fetchStub.getCall(1).args[1].body as string)
    expect(explicit.pricing_model).to.equal('CPM')
    expect(explicit.start_time).to.equal('2026-09-01T00:00:00Z')
    expect(explicit.end_time).to.equal('2026-09-30T00:00:00Z')
  })

  it('ad-groups update passes a schedule only when asked', async () => {
    fetchStub = mockFetch([AD_GROUP_OK])
    await runCommand(`asa ad-groups update --yes ${TEST_RESOURCE_ID} --start-time 2026-09-01`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body).to.deep.equal({start_time: '2026-09-01T00:00:00Z'})
  })

  it('ad-groups create refuses a malformed date before the network', async () => {
    fetchStub = mockFetch([AD_GROUP_OK])
    const {error} = await runCommand(
      `asa ad-groups create --yes --campaign ${TEST_RESOURCE_ID} --name AG --default-bid 1 --start-time 01.09.2026`,
    )
    expect(error?.message).to.contain('YYYY-MM-DD')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('keywords add turns repeated --text into one batch', async () => {
    fetchStub = mockFetch([KEYWORDS_OK])
    const {stdout} = await runCommand(
      `asa keywords add --yes --ad-group ${TEST_RESOURCE_ID} --text "running shoes" --text "trail shoes" --bid 1.20 --match-type EXACT`,
    )
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body.keywords).to.have.length(2)
    expect(body.keywords[0]).to.deep.equal({
      ad_group_id: TEST_RESOURCE_ID,
      bid_amount: {amount: '1.20', currency: 'USD'},
      match_type: 'EXACT',
      status: 'ACTIVE',
      text: 'running shoes',
    })
    expect(stdout).to.contain('1 keywords applied, 0 rejected')
  })

  it('keywords add reads a file and merges it with --text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asa-cli-'))
    const path = join(dir, 'keywords.txt')
    await writeFile(path, 'from file\n\n  second one  \n')
    fetchStub = mockFetch([KEYWORDS_OK])
    await runCommand(`asa keywords add --yes --ad-group ${TEST_RESOURCE_ID} --text inline --from-file ${path}`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body.keywords.map((item: {text: string}) => item.text)).to.deep.equal(['inline', 'from file', 'second one'])
  })

  it('keywords add refuses an empty batch and one over the cap', async () => {
    fetchStub = mockFetch([KEYWORDS_OK])
    const empty = await runCommand(`asa keywords add --yes --ad-group ${TEST_RESOURCE_ID}`)
    expect(empty.error?.message).to.contain('at least one --text')
    const texts = Array.from({length: 101}, (_, index) => `--text kw${index}`).join(' ')
    const overCap = await runCommand(`asa keywords add --yes --ad-group ${TEST_RESOURCE_ID} ${texts}`)
    expect(overCap.error?.message).to.contain('at most 100')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('keywords add reports the rejected half of a partial batch', async () => {
    fetchStub = mockFetch([
      {
        errors: [{apple_error_message: 'Duplicate keyword', input_ref: 1}],
        is_validation_failure: false,
        keywords: [{internal_id: TEST_RESOURCE_ID}],
      },
    ])
    const {stdout} = await runCommand(`asa keywords add --yes --ad-group ${TEST_RESOURCE_ID} --text a --text b`)
    expect(stdout).to.contain('1 keywords applied, 1 rejected')
    expect(stdout).to.contain('Duplicate keyword (item 2)')
  })

  it('keywords update applies one change to several ids', async () => {
    fetchStub = mockFetch([KEYWORDS_OK])
    await runCommand(`asa keywords update --yes ${TEST_RESOURCE_ID} ${TEST_APP_ID} --status PAUSED`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body.keywords).to.deep.equal([
      {internal_id: TEST_RESOURCE_ID, status: 'PAUSED'},
      {internal_id: TEST_APP_ID, status: 'PAUSED'},
    ])
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'PUT', path: '/keywords/', stub: fetchStub})
  })

  it('keywords update refuses to give many keywords the same text', async () => {
    fetchStub = mockFetch([KEYWORDS_OK])
    const {error} = await runCommand(`asa keywords update --yes ${TEST_RESOURCE_ID} ${TEST_APP_ID} --text same`)
    expect(error?.message).to.contain('one at a time')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('negative keywords pick the scope from the parent flag', async () => {
    fetchStub = mockFetch([NEGATIVES_OK, NEGATIVES_OK, NEGATIVES_OK])
    await runCommand(`asa negative-keywords add --yes --ad-group ${TEST_RESOURCE_ID} --text free`)
    await runCommand(`asa negative-keywords add --yes --campaign ${TEST_RESOURCE_ID} --text free`)
    await runCommand(`asa negative-keywords add --yes --campaign ${TEST_RESOURCE_ID} --all-ad-groups --text free`)

    const bodies = [0, 1, 2].map((index) => JSON.parse(fetchStub.getCall(index).args[1].body as string))
    expect(bodies[0].scope).to.equal('AD_GROUP')
    expect(bodies[0].negative_keywords[0].ad_group_id).to.equal(TEST_RESOURCE_ID)
    expect(bodies[0].negative_keywords[0].campaign_id).to.equal(undefined)
    expect(bodies[1].scope).to.equal('CAMPAIGN')
    expect(bodies[1].negative_keywords[0].campaign_id).to.equal(TEST_RESOURCE_ID)
    expect(bodies[2].scope).to.equal('ALL_CAMPAIGN_AD_GROUPS')
  })

  it('negative keywords refuse both parents at once', async () => {
    fetchStub = mockFetch([NEGATIVES_OK])
    const {error} = await runCommand(
      `asa negative-keywords add --yes --ad-group ${TEST_RESOURCE_ID} --campaign ${TEST_APP_ID} --text free`,
    )
    expect(error?.message).to.contain('cannot also be provided')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('ads create sends the ad group and creative, update only the touched fields', async () => {
    fetchStub = mockFetch([AD_OK, AD_OK])
    await runCommand(`asa ads create --yes --ad-group ${TEST_RESOURCE_ID} --creative-id 4321 --name "Summer ad"`)
    await runCommand(`asa ads update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    assertFetch({
      base: ASA_API_BASE,
      body: {ad_group_id: TEST_RESOURCE_ID, creative_id: 4321, name: 'Summer ad'},
      callIndex: 0,
      method: 'POST',
      path: '/ads/',
      stub: fetchStub,
    })
    const updateBody = JSON.parse(fetchStub.getCall(1).args[1].body as string)
    expect(updateBody).to.deep.equal({status: 'PAUSED'})
  })

  it('product-pages sync posts with --yes and carries an idempotency key', async () => {
    fetchStub = mockFetch([
      {accepted_at: '2026-08-03T10:00:00Z', message: 'queued', org_targets: 2, replayed: false, state: 'accepted', sync_id: 'x'},
    ])
    await runCommand('asa product-pages sync --yes --adam-id 123456')
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body).to.deep.equal({adam_id: 123_456})
    const headers = fetchStub.getCall(0).args[1].headers as Record<string, string>
    expect(headers['Idempotency-Key']).to.be.a('string').and.not.equal('')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'POST', path: '/product-pages/sync/', stub: fetchStub})
  })

  it('product-pages sync refuses without --yes when nobody can answer', async () => {
    fetchStub = mockFetch([{}])
    const {error, stderr} = await runCommand('asa product-pages sync')
    expect(error?.oclif?.exit).to.equal(2)
    expect(stderr).to.contain('POST /product-pages/sync/')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('automations create reads the rule from a file and can request the first run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asa-cli-'))
    const path = join(dir, 'rule.json')
    await writeFile(path, JSON.stringify({conditions: [], name: 'pause expensive', operate_with: 'targeting-keyword', status: 1}))
    fetchStub = mockFetch([{automation: {id: TEST_RESOURCE_ID, name: 'pause expensive'}}])
    await runCommand(`asa automations create --yes --file ${path} --run-now`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body.name).to.equal('pause expensive')
    expect(body.run_immediately).to.equal(true)
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'POST', path: '/automations/', stub: fetchStub})
  })

  it('automations create rejects a file that is not JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'asa-cli-'))
    const path = join(dir, 'rule.json')
    await writeFile(path, 'not json at all')
    fetchStub = mockFetch([{}])
    const {error} = await runCommand(`asa automations create --yes --file ${path}`)
    expect(error?.message).to.contain('not valid JSON')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('automations update maps --stop to status 0 and refuses an id inside the file', async () => {
    fetchStub = mockFetch([{automation: {id: TEST_RESOURCE_ID}}])
    await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --stop`)
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body).to.deep.equal({status: 0})

    const dir = await mkdtemp(join(tmpdir(), 'asa-cli-'))
    const path = join(dir, 'rule.json')
    await writeFile(path, JSON.stringify({internal_id: TEST_RESOURCE_ID, name: 'x'}))
    const {error} = await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --file ${path}`)
    expect(error?.message).to.contain('Remove internal_id')
  })

  it('automations run passes dry_run as a query flag', async () => {
    fetchStub = mockFetch([{automation_id: TEST_RESOURCE_ID, dry_run: true, run_id: 'run-42'}])
    const {stdout} = await runCommand(`asa automations run --yes ${TEST_RESOURCE_ID} --dry-run`)
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'POST',
      path: `/automations/${TEST_RESOURCE_ID}/run/`,
      query: {dry_run: 'true'},
      stub: fetchStub,
    })
    expect(stdout).to.contain('Dry run queued')
    expect(stdout).to.contain('run-42')
  })

  it('metrics posts the period and the resolved metric names', async () => {
    fetchStub = mockFetch([{data: [], meta: {pagination: {count: 0, page: 1, pages: 1}}}])
    await runCommand('asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --metric spend --metric roas')
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body).to.deep.include({date_from: '2026-07-01', date_to: '2026-07-31', entity: 'campaign', order: 'desc'})
    expect(body.metrics).to.deep.equal(['spend', 'roas'])
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'POST', path: '/metrics/', stub: fetchStub})
  })

  it('metrics sends the requested renewal windows and caps them client-side', async () => {
    fetchStub = mockFetch([{data: [], meta: {pagination: {count: 0, page: 1, pages: 1}}}])
    await runCommand(
      'asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --metric roas --by-days 7 --by-days 90',
    )
    const body = JSON.parse(fetchStub.getCall(0).args[1].body as string)
    expect(body.by_days).to.deep.equal([7, 90])

    await runCommand(
      'asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --by-days 90 --order-by gross_roas --order-by-day 90',
    )
    const ranked = JSON.parse(fetchStub.getCall(1).args[1].body as string)
    expect(ranked).to.deep.include({order_by: 'gross_roas', order_by_day: 90})

    const byDays = Array.from({length: 17}, (_, index) => `--by-days ${index}`).join(' ')
    const {error} = await runCommand(`asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 ${byDays}`)
    expect(error?.message).to.contain('At most 16')
    expect(fetchStub.callCount).to.equal(2)
  })

  it('metrics overview caps the renewal windows client-side', async () => {
    fetchStub = mockFetch([{}])
    const byDays = Array.from({length: 17}, (_, index) => `--by-days ${index}`).join(' ')
    const {error} = await runCommand(
      `asa metrics overview --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 ${byDays}`,
    )
    expect(error?.message).to.contain('At most 16')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('connect asks the ASA host for the authorization link', async () => {
    fetchStub = mockFetchFailure(
      {
        errors: [
          {
            error_code: 'ads_manager_subscription_required',
            message: 'An active Adapty Ads Manager subscription is required to use the CLI.',
          },
        ],
      },
      {status: 402},
    )
    const {error} = await runCommand('asa connect')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/apple/oauth/', stub: fetchStub})
    expect(error?.message).to.contain('subscription is required')
    expect(fetchStub.callCount).to.equal(1)
  })

  it('connect refuses to start without a token', async () => {
    delete process.env.ADAPTY_TOKEN
    fetchStub = mockFetch([{auth_url: 'https://appleid.apple.com/auth?state=abc'}])
    const {error} = await runCommand('asa connect')
    expect(error?.message).to.contain('adapty auth login')
    expect(fetchStub.callCount).to.equal(0)
  })
})
