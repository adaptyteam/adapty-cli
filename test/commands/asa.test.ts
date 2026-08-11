import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import sinon from 'sinon'

import {ASA_API_BASE, assertFetch, EMPTY_LIST_RESPONSE, mockFetch, mockFetchFailure, restoreFetch} from '../helpers/mock-fetch.js'

const ME_RESPONSE = {
  access_source: 'payg',
  apple_credentials_status: 'active',
  company_id: '550e8400-e29b-41d4-a716-446655440000',
}

describe('asa', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
    delete process.env.ADAPTY_ASA_API_URL
  })

  it('whoami calls GET /me on the ASA host', async () => {
    fetchStub = mockFetch([ME_RESPONSE])
    const {stdout} = await runCommand('asa whoami')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/me/', stub: fetchStub})
    expect(stdout).to.contain('Access Source: payg')
    expect(stdout).to.not.contain('asa connect')
  })

  it('whoami nudges to connect when Apple Ads is missing', async () => {
    fetchStub = mockFetch([{...ME_RESPONSE, apple_credentials_status: 'unset'}])
    const {stdout} = await runCommand('asa whoami')
    expect(stdout).to.contain('adapty asa connect')
  })

  it('whoami explains that a company without access can still connect', async () => {
    fetchStub = mockFetch([{...ME_RESPONSE, access_source: 'none', apple_credentials_status: 'unset'}])
    const {stdout} = await runCommand('asa whoami')
    expect(stdout).to.contain('Access Source: none')
    expect(stdout).to.contain('No active Ads Manager subscription')
    expect(stdout).to.contain('402')
  })

  it('apps list calls GET /apps with pagination', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa apps list --page 2 --page-size 50')
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: '/apps/',
      query: {'page[number]': '2', 'page[size]': '50'},
      stub: fetchStub,
    })
  })

  it('orgs list calls GET /campaign-groups', async () => {
    fetchStub = mockFetch([EMPTY_LIST_RESPONSE])
    await runCommand('asa orgs list')
    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'GET', path: '/campaign-groups/', stub: fetchStub})
  })

  it('does not warn about a non-default URL when using the ASA default', async () => {
    fetchStub = mockFetch([ME_RESPONSE])
    const {stderr} = await runCommand('asa whoami')
    expect(stderr).to.not.contain('non-default API URL')
  })

  it('honours ADAPTY_ASA_API_URL without touching the core API host', async () => {
    process.env.ADAPTY_ASA_API_URL = 'https://asa.dev.example/api/v1/cli'
    fetchStub = mockFetch([ME_RESPONSE])
    await runCommand('asa whoami')
    assertFetch({base: 'https://asa.dev.example/api/v1/cli', callIndex: 0, method: 'GET', path: '/me/', stub: fetchStub})
  })

  it('reports the ASA error envelope instead of a bare status code', async () => {
    fetchStub = mockFetchFailure(
      {
        errors: [
          {
            error_code: 'ads_manager_subscription_required',
            field_name: null,
            message: 'An active Adapty Ads Manager subscription is required to use the CLI.',
            status_code: 402,
          },
        ],
      },
      {status: 402},
    )
    const {error} = await runCommand('asa whoami')
    expect(error?.message).to.contain('subscription is required')
  })

  it('surfaces the throttling message from a 429', async () => {
    fetchStub = mockFetchFailure(
      {errors: [{error_code: 'cli_rate_limit_exceeded', message: 'Rate limit exceeded. Retry in 7 second(s).'}]},
      {headers: {'Retry-After': '7'}, status: 429},
    )
    const {error} = await runCommand('asa whoami')
    expect(error?.message).to.contain('Retry in 7')
  })
})
