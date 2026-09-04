import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {writeFile} from 'node:fs/promises'
import {type SinonStub, stub} from 'sinon'

import {EMPTY_LIST_RESPONSE, TEST_APP_ID} from '../helpers/mock-fetch.js'
import {useTmpDir} from '../helpers/tmp-dir.js'

const LIST_WITH_PLACEMENT = {
  data: [{developer_id: 'onboarding', id: 'pl-1', title: 'Onboarding'}],
  meta: {pagination: {count: 1, page: 1, pages: 1}},
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json'}, status: 200})
}

/** Routed by URL, not call order - the playbook fetch races the API calls. */
function stubFetchByUrl(): SinonStub {
  return stub(globalThis, 'fetch').callsFake(async (input) => {
    const url = String(input)
    if (url.includes('raw.githubusercontent.com')) return new Response('# playbook', {status: 200})
    if (url.includes('/placements')) return json(LIST_WITH_PLACEMENT)
    if (url.includes('/access-levels') || url.includes('/products') || url.includes('/paywalls'))
      return json(EMPTY_LIST_RESPONSE)
    if (url.includes(`/apps/${TEST_APP_ID}/`))
      return json({id: TEST_APP_ID, platforms: [], sdk_key: 'public_live_x', secret_key: null, title: 'My App'})
    return json(EMPTY_LIST_RESPONSE)
  })
}

describe('migrate', () => {
  const tmpDir = useTmpDir('adapty-migrate-test-')
  let fetchStub: SinonStub

  afterEach(() => {
    fetchStub.restore()
    delete process.env.ADAPTY_TOKEN
  })

  // Pins the fix for the swallowed refusal: the mode decision runs OUTSIDE the
  // app-binding try/catch, so a headless run against a populated app must abort
  // even on --copy - never fall through and emit a create-mode prompt.
  it('headless run against a populated app refuses without --code-only, even on --copy', async () => {
    process.env.ADAPTY_TOKEN = 'test-token'
    fetchStub = stubFetchByUrl()
    await writeFile(`${tmpDir()}/pubspec.yaml`, 'name: demo_app\ndependencies:\n  flutter:\n    sdk: flutter\n')

    const {error} = await runCommand(`migrate --copy --app ${TEST_APP_ID} --path ${tmpDir()}`)

    expect(error, 'expected the command to error').to.exist
    expect(error?.message).to.include('--code-only')
  })
})
