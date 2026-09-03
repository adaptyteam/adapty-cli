import {runCommand} from '@oclif/test'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
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

  it('update calls PUT /apps/{app}/flows/{id} with the new name', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([FLOW_RESPONSE])
    await runCommand(`flows update ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --name "Onboarding v2"`)
    assertFetch({
      body: {name: 'Onboarding v2'},
      callIndex: 0,
      method: 'PUT',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
  })

  it('publish GETs the flow then POSTs /apps/{app}/flows/{id}/publish with no body', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([FLOW_RESPONSE, {...FLOW_RESPONSE, status: 'publishing'}])
    await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes`)
    assertFetch({
      callIndex: 0,
      method: 'GET',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
    assertFetch({
      callIndex: 1,
      method: 'POST',
      path: `/apps/${TEST_APP_ID}/flows/${TEST_RESOURCE_ID}/publish/`,
      stub: fetchStub,
    })
    const init = fetchStub.getCall(1).args[1] as {body?: unknown}
    if (init.body !== undefined) throw new Error('Expected no request body for publish')
  })

  it('publish refuses non-interactively without --yes and never calls the publish endpoint', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([FLOW_RESPONSE])
    const {error} = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`)
    const exit = (error as undefined | {oclif?: {exit?: number}})?.oclif?.exit
    if (exit !== 2) throw new Error(`Expected exit code 2, got ${exit}`)
    for (let i = 0; i < fetchStub.callCount; i++) {
      const {method} = fetchStub.getCall(i).args[1] as {method: string}
      if (method === 'POST') throw new Error('Publish endpoint must not be called without --yes')
    }
  })

  it('publish enriches a 400 with builder + skill links pointing at the flow', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async (_url, init) => {
      const method = (init as undefined | {method?: string})?.method ?? 'GET'
      if (method === 'POST') {
        return new Response(
          JSON.stringify({error_code: 'validation_error', errors: {non_field_errors: ['Flow has no current version.']}}),
          {headers: {'Content-Type': 'application/json'}, status: 400},
        )
      }

      return new Response(JSON.stringify(FLOW_RESPONSE), {headers: {'Content-Type': 'application/json'}, status: 200})
    })

    const {error} = await runCommand(`flows publish ${TEST_RESOURCE_ID} --app ${TEST_APP_ID} --yes`)
    const exit = (error as undefined | {oclif?: {exit?: number}})?.oclif?.exit
    if (exit === 0 || exit === undefined) throw new Error(`Expected a non-zero exit, got ${exit}`)
    const message = (error as undefined | {message?: string})?.message ?? ''
    if (!message.includes('Flow has no current version.')) throw new Error(`Missing server reason: ${message}`)
    if (!message.includes(`https://app.adapty.io/flows/${TEST_RESOURCE_ID}/builder`)) {
      throw new Error(`Missing builder link: ${message}`)
    }

    if (!message.includes('https://adapty.io/docs/flow-generator-skill')) {
      throw new Error(`Missing skill link: ${message}`)
    }
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

  it('config validate POSTs the config to /config/validate', async () => {
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
    ])
    assertFetch({
      body: {config: {locales: [], screens: []}},
      callIndex: 0,
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

  it('media upload POSTs multipart to /flows/media/images with the file field', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = mockFetch([{id: 42, name: 'hero.png', preview_base64: 'x', url: 'https://cdn/hero.png'}])
    const dir = await mkdtemp(join(tmpdir(), 'adapty-media-'))
    const path = join(dir, 'hero.png')
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await runCommand(`flows media upload ${path} --app ${TEST_APP_ID}`)

    const init = fetchStub.getCall(0).args[1] as {body: FormData; method: string}
    if (init.method !== 'POST') throw new Error(`Expected POST, got ${init.method}`)
    if (!(init.body instanceof FormData)) throw new Error('Expected multipart FormData body')
    const file = init.body.get('file') as File
    if (file.name !== 'hero.png') throw new Error(`Expected file name hero.png, got ${file.name}`)
    if (file.type !== 'image/png') throw new Error(`Expected image/png, got ${file.type}`)

    const url = fetchStub.getCall(0).args[0] as string
    const expected = `/apps/${TEST_APP_ID}/flows/media/images/`
    if (!url.endsWith(expected)) throw new Error(`Expected path ${expected}, got ${url}`)
  })
})
