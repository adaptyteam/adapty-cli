import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as sinon from 'sinon'

import {
  ASA_API_BASE,
  assertFetch,
  EMPTY_LIST_RESPONSE,
  mockFetch,
  mockFetchFailure,
  restoreFetch,
  TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js'

const CAMPAIGN_OK = {campaign: {campaign_id: 777, internal_id: TEST_RESOURCE_ID, name: 'x', status: 'PAUSED'}, errors: []}
const KEYWORDS_OK = {errors: [], is_validation_failure: false, keywords: [{internal_id: TEST_RESOURCE_ID, text: 'shoes'}]}
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/

function keyOf(stub: sinon.SinonStub, callIndex: number): string | undefined {
  const headers = stub.getCall(callIndex).args[1].headers as Record<string, string>
  return headers['Idempotency-Key']
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json', ...headers}, status: 200})
}

describe('asa idempotency', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('every write sends a generated Idempotency-Key', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK])
    await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    expect(keyOf(fetchStub, 0)).to.match(UUID_RE)
  })

  it('a fresh key is generated per invocation', async () => {
    fetchStub = mockFetch([CAMPAIGN_OK, CAMPAIGN_OK])
    await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    expect(keyOf(fetchStub, 0)).to.match(UUID_RE)
    expect(keyOf(fetchStub, 0)).to.not.equal(keyOf(fetchStub, 1))
  })

  it('--idempotency-key overrides the generated key', async () => {
    fetchStub = mockFetch([KEYWORDS_OK])
    await runCommand(
      `asa keywords add --yes --ad-group ${TEST_RESOURCE_ID} --text shoes --idempotency-key deploy-2026-08-06`,
    )
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      headers: {'Idempotency-Key': 'deploy-2026-08-06'},
      method: 'POST',
      path: '/keywords/',
      stub: fetchStub,
    })
  })

  it('reads carry no idempotency key', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa campaigns list')
    expect(keyOf(fetchStub, 0)).to.equal(undefined)
  })

  it('metrics posts carry a key too, so a network retry cannot double-submit', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --metric spend')
    expect(keyOf(fetchStub, 0)).to.match(UUID_RE)
  })

  it('one network failure is retried with the same key', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch')
    fetchStub.onFirstCall().rejects(new TypeError('fetch failed'))
    fetchStub.onSecondCall().resolves(jsonResponse(CAMPAIGN_OK))
    const {error} = await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    expect(error).to.equal(undefined)
    expect(fetchStub.callCount).to.equal(2)
    expect(keyOf(fetchStub, 0)).to.match(UUID_RE)
    expect(keyOf(fetchStub, 0)).to.equal(keyOf(fetchStub, 1))
  })

  it('a second network failure surfaces instead of looping', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('fetch failed'))
    const {error} = await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    expect(error?.message).to.contain('fetch failed')
    expect(fetchStub.callCount).to.equal(2)
  })

  it('an API error is not retried', async () => {
    fetchStub = mockFetchFailure({errors: [{message: 'same key, different body'}]}, {status: 422})
    const {error} = await runCommand(`asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED`)
    expect(error?.message).to.contain('same key, different body')
    expect(fetchStub.callCount).to.equal(1)
  })

  it('a replayed response is announced instead of the success line', async () => {
    fetchStub = mockFetchFailure(CAMPAIGN_OK, {headers: {'Idempotency-Replayed': 'true'}, status: 200})
    const {stdout} = await runCommand(
      `asa campaigns update --yes ${TEST_RESOURCE_ID} --status PAUSED --idempotency-key deploy-2026-08-06`,
    )
    expect(stdout).to.contain('Already applied earlier')
    expect(stdout).to.not.contain('Campaign updated!')
  })

  it('the replay note stays out of --json output', async () => {
    fetchStub = mockFetchFailure(CAMPAIGN_OK, {headers: {'Idempotency-Replayed': 'true'}, status: 200})
    const {stdout} = await runCommand(
      `asa campaigns update --yes --json ${TEST_RESOURCE_ID} --status PAUSED --idempotency-key deploy-2026-08-06`,
    )
    expect(stdout).to.not.contain('Already applied')
    expect(JSON.parse(stdout)).to.deep.equal(CAMPAIGN_OK)
  })
})
