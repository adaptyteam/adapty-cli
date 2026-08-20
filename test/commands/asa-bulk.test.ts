import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sinon from 'sinon'

import {ASA_API_BASE, assertFetch, mockFetch, restoreFetch, TEST_RESOURCE_ID} from '../helpers/mock-fetch.js'

const STRUCTURE = {
  campaign_group_id: 555_777,
  campaigns: [
    {
      ad_groups: [
        {
          keywords: [{match_type: 'BROAD', text: 'meditation app'}],
          payload: {name: 'Brand', start_time: '2026-08-01T00:00:00Z', status: 'ENABLED'},
        },
      ],
      payload: {
        ad_channel_type: 'SEARCH',
        adam_id: 123_456,
        billing_event: 'TAPS',
        countries_or_regions: ['US'],
        daily_budget_amount: {amount: '100', currency: 'USD'},
        name: 'US Search',
        status: 'ENABLED',
        supply_sources: ['APPSTORE_SEARCH_RESULTS'],
      },
    },
  ],
}

const ACCEPTED = {operation_id: TEST_RESOURCE_ID}

function state(status: string, applied: number, failed = 0) {
  return {
    counts: {applied, failed, pending: 3 - applied - failed, total: 3},
    created_at: '2026-08-13T10:00:00Z',
    finished_at: null,
    objects: [],
    operation_id: TEST_RESOURCE_ID,
    pipelines: [],
    started_at: null,
    status,
  }
}

async function structureFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'adapty-bulk-'))
  const path = join(dir, 'structure.json')
  await writeFile(path, JSON.stringify(STRUCTURE))
  return path
}

describe('asa bulk', () => {
  describe('campaigns bulk-create', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('sends the structure verbatim and polls until the terminal status', async () => {
    fetchStub = mockFetch([ACCEPTED, state('running', 1), state('success', 3)])
    const {stdout} = await runCommand(`asa campaigns bulk-create --yes --file ${await structureFile()} --poll-interval 0`)

    assertFetch({base: ASA_API_BASE, body: STRUCTURE, callIndex: 0, method: 'POST', path: '/bulk-operations/', stub: fetchStub})
    const pollUrl = fetchStub.getCall(1).args[0] as string
    expect(pollUrl).to.contain(`/bulk-operations/${TEST_RESOURCE_ID}/`)
    expect(stdout).to.contain(`Operation accepted: ${TEST_RESOURCE_ID}`)
    expect(stdout).to.contain('running: 1/3 applied, 0 failed')
    expect(stdout).to.contain('Finished: success — 3/3 applied, 0 failed')
  })

  it('returns the operation id immediately with --no-wait', async () => {
    fetchStub = mockFetch([ACCEPTED])
    const {stdout} = await runCommand(`asa campaigns bulk-create --yes --file ${await structureFile()} --no-wait`)

    expect(fetchStub.callCount).to.equal(1)
    expect(stdout).to.contain(`bulk-status ${TEST_RESOURCE_ID}`)
  })

  it('exits non-zero when the operation fails', async () => {
    fetchStub = mockFetch([ACCEPTED, state('failed', 0, 3)])
    const {error} = await runCommand(`asa campaigns bulk-create --yes --file ${await structureFile()} --poll-interval 0`)

    expect(error?.message).to.contain('Bulk operation failed')
  })

  it('refuses to run from a script unless --yes is passed', async () => {
    fetchStub = mockFetch([ACCEPTED])
    const {stderr} = await runCommand(`asa campaigns bulk-create --json --file ${await structureFile()}`)

    expect(stderr).to.contain('--yes')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('rejects a file that is not valid JSON without calling the API', async () => {
    fetchStub = mockFetch([ACCEPTED])
    const dir = await mkdtemp(join(tmpdir(), 'adapty-bulk-'))
    const path = join(dir, 'broken.json')
    await writeFile(path, 'not json at all')
    const {error} = await runCommand(`asa campaigns bulk-create --yes --file ${path}`)

    expect(error?.message).to.contain('not valid JSON')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('converts an Apple template and submits the converted request', async () => {
    const converted = {errors: [], request: STRUCTURE, warnings: []}
    fetchStub = mockFetch([converted, ACCEPTED, state('success', 3)])
    const dir = await mkdtemp(join(tmpdir(), 'adapty-bulk-'))
    const path = join(dir, 'keywords_template.csv')
    await writeFile(path, 'Action,Keyword\nCREATE,yoga\n')
    const {stdout} = await runCommand(
      `asa campaigns bulk-create --yes --from-file ${path} --org-id 555777 --poll-interval 0`,
    )

    const convertInit = fetchStub.getCall(0).args[1] as {body: FormData; method: string}
    expect(convertInit.method).to.equal('POST')
    expect(convertInit.body).to.be.instanceOf(FormData)
    expect(convertInit.body.get('campaign_group_id')).to.equal('555777')
    expect((convertInit.body.get('file') as File).name).to.equal('keywords_template.csv')
    assertFetch({base: ASA_API_BASE, body: STRUCTURE, callIndex: 1, method: 'POST', path: '/bulk-operations/', stub: fetchStub})
    expect(stdout).to.contain('Finished: success')
  })

  it('prints conversion issues with their file position and creates nothing', async () => {
    const converted = {
      errors: [{column: 'Bid', message: 'not a number', row: 3, sheet: null}],
      request: null,
      warnings: [],
    }
    fetchStub = mockFetch([converted])
    const dir = await mkdtemp(join(tmpdir(), 'adapty-bulk-'))
    const path = join(dir, 'keywords_template.csv')
    await writeFile(path, 'Action,Keyword\nCREATE,yoga\n')
    const {error, stdout} = await runCommand(`asa campaigns bulk-create --yes --from-file ${path} --org-id 555777`)

    expect(stdout).to.contain('row 3, Bid: not a number')
    expect(error?.message).to.contain('conversion failed')
    expect(fetchStub.callCount).to.equal(1)
  })

  it('with --preview prints the converted request and stops', async () => {
    const converted = {errors: [], request: STRUCTURE, warnings: []}
    fetchStub = mockFetch([converted])
    const dir = await mkdtemp(join(tmpdir(), 'adapty-bulk-'))
    const path = join(dir, 'keywords_template.csv')
    await writeFile(path, 'Action,Keyword\nCREATE,yoga\n')
    const {stdout} = await runCommand(
      `asa campaigns bulk-create --yes --from-file ${path} --org-id 555777 --preview`,
    )

    expect(fetchStub.callCount).to.equal(1)
    expect(JSON.parse(stdout)).to.deep.equal(STRUCTURE)
  })

  it('requires --org-id together with --from-file', async () => {
    fetchStub = mockFetch([])
    const {error} = await runCommand('asa campaigns bulk-create --yes --from-file whatever.csv')

    expect(error?.message).to.contain('--org-id')
    expect(fetchStub.callCount).to.equal(0)
  })
  })

  describe('campaigns bulk-status', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('fetches one operation with the paging flags', async () => {
    fetchStub = mockFetch([state('partial', 2, 1)])
    const {stdout} = await runCommand(`asa campaigns bulk-status ${TEST_RESOURCE_ID} --page 3 --page-size 50`)

    const url = fetchStub.getCall(0).args[0] as string
    expect(url).to.contain(`/bulk-operations/${TEST_RESOURCE_ID}/`)
    expect(url).to.contain(`${encodeURIComponent('page[number]')}=3`)
    expect(url).to.contain(`${encodeURIComponent('page[size]')}=50`)
    expect(stdout).to.contain('Status: partial')
  })

  it('rejects a malformed operation id before calling the API', async () => {
    fetchStub = mockFetch([])
    const {error} = await runCommand('asa campaigns bulk-status not-a-uuid')

    expect(error?.message).to.contain('Invalid operation ID')
    expect(fetchStub.callCount).to.equal(0)
  })
})

  describe('campaigns bulk-list', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('lists operations passing every filter as a query param', async () => {
    fetchStub = mockFetch([
      {
        items: [
          {
            app_id: TEST_RESOURCE_ID,
            created_at: '2026-08-13T10:00:00Z',
            error: null,
            finished_at: '2026-08-13T10:01:00Z',
            operation_id: TEST_RESOURCE_ID,
            started_at: '2026-08-13T10:00:01Z',
            status: 'partial',
          },
        ],
        limit: 50,
        offset: 50,
        total: 51,
      },
    ])
    const {stdout} = await runCommand(
      `asa campaigns bulk-list --status partial --status failed --app ${TEST_RESOURCE_ID} ` +
        '--created-from 2026-08-01 --created-to 2026-08-13 --page 2 --page-size 50',
    )

    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: '/bulk-operations/',
      query: {
        app_id: TEST_RESOURCE_ID,
        created_from: '2026-08-01',
        created_to: '2026-08-13',
        'page[number]': '2',
        'page[size]': '50',
      },
      stub: fetchStub,
    })
    const url = fetchStub.getCall(0).args[0] as string
    expect(new URLSearchParams(url.split('?')[1]).getAll('status')).to.deep.equal(['partial', 'failed'])
    expect(stdout).to.contain(`Operation ID: ${TEST_RESOURCE_ID}`)
    expect(stdout).to.contain('Status: partial')
    expect(stdout).to.contain('Page 2 of 2 (51 total)')
  })

  it('rejects a malformed app id before calling the API', async () => {
    fetchStub = mockFetch([])
    const {error} = await runCommand('asa campaigns bulk-list --app not-a-uuid')

    expect(error?.message).to.contain('Invalid app ID')
    expect(fetchStub.callCount).to.equal(0)
  })
})
})
