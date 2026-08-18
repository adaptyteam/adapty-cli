import {expect} from 'chai'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'

import {firstScreenId, normalizePreviewConfig} from '../../src/lib/preview-config.js'
import {buildReferenceCommand, referenceScriptPath} from '../../src/lib/preview-reference.js'
import {buildRenderUrl, FRAGMENT_GZIP_PREFIX, resolveRenderUrl} from '../../src/lib/preview-url.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/flow-config.json', import.meta.url))
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown

function decodeConfigFragment(hash: string): unknown {
  const encoded = new URLSearchParams(hash.slice(1)).get('config')
  if (!encoded?.startsWith(FRAGMENT_GZIP_PREFIX)) throw new Error(`Not a gzipped fragment: ${encoded}`)
  const gzipped = Buffer.from(encoded.slice(FRAGMENT_GZIP_PREFIX.length), 'base64url')
  return JSON.parse(gunzipSync(gzipped).toString('utf8')) as unknown
}

describe('preview', () => {
  describe('config normalization', () => {
  it('maps a dashboard-api envelope to the injection payload', () => {
    const payload = normalizePreviewConfig({
      config: {screens: [{id: 'welcome'}]},
      remote_configs: [{locale: 'en'}],
      status: 'draft',
      updated_at: '2026-02-19T00:00:00Z',
    })

    expect(payload).to.deep.equal({flow: {screens: [{id: 'welcome'}]}, remoteConfigs: [{locale: 'en'}]})
  })

  it('defaults missing remote_configs to an empty list', () => {
    expect(normalizePreviewConfig({config: {screens: []}}).remoteConfigs).to.deep.equal([])
  })

  it('wraps a bare builder config', () => {
    const flow = {locales: {en: {}}, theme: {}}
    expect(normalizePreviewConfig(flow)).to.deep.equal({flow, remoteConfigs: []})
  })

  it('rejects unrecognized JSON', () => {
    expect(() => normalizePreviewConfig({hello: 'world'})).to.throw('Unrecognized config file')
    expect(() => normalizePreviewConfig([1, 2])).to.throw('must contain a JSON object')
  })

  it('finds the first screen id in arrays and records', () => {
    expect(firstScreenId({screens: [{id: 'welcome'}, {id: 'offer'}]})).to.equal('welcome')
    expect(firstScreenId({screens: {offer: {}, welcome: {}}})).to.equal('offer')
    expect(firstScreenId({})).to.equal(undefined)
  })
})

describe('render url', () => {
  afterEach(() => {
    delete process.env.ADAPTY_PREVIEW_RENDER_URL
  })

  it('prefers the flag over the env var', () => {
    process.env.ADAPTY_PREVIEW_RENDER_URL = 'https://env.example/render'
    expect(resolveRenderUrl('https://flag.example/render')).to.equal('https://flag.example/render')
    expect(resolveRenderUrl()).to.equal('https://env.example/render')
  })

  it('errors when neither is set', () => {
    expect(() => resolveRenderUrl()).to.throw('ADAPTY_PREVIEW_RENDER_URL')
  })

  it('adds screen and device query params', () => {
    expect(buildRenderUrl('https://app.example/preview', {device: 'iphone-14', screen: 'welcome'})).to.equal(
      'https://app.example/preview?screen=welcome&device=iphone-14',
    )
  })

  it('omits the screen param when unknown', () => {
    expect(buildRenderUrl('https://app.example/preview', {device: 'iphone-14'})).to.equal(
      'https://app.example/preview?device=iphone-14',
    )
  })

  it('carries a real config through the gzipped fragment fallback', () => {
    const payload = normalizePreviewConfig(FIXTURE)
    const url = new URL(buildRenderUrl('https://app.example/preview', {device: 'iphone-14', screen: 'offer'}, payload))

    expect(url.hash.startsWith(`#config=${FRAGMENT_GZIP_PREFIX}`)).to.equal(true)
    expect(url.hash.slice(`#config=${FRAGMENT_GZIP_PREFIX}`.length)).to.match(/^[\w-]+$/)
    expect(decodeConfigFragment(url.hash)).to.deep.equal(payload)
  })

  it('compresses the fragment well below the raw JSON size', () => {
    const payload = normalizePreviewConfig(FIXTURE)
    const raw = JSON.stringify(payload)
    const {hash} = new URL(buildRenderUrl('https://app.example/preview', {device: 'iphone-14'}, payload))

    expect(hash.length).to.be.lessThan(raw.length)
  })

  it('does not cap the fragment size', () => {
    const payload = {flow: {padding: 'x'.repeat(200_000), screens: []}, remoteConfigs: []}
    const url = new URL(buildRenderUrl('https://app.example/preview', {device: 'iphone-14'}, payload))

    expect(decodeConfigFragment(url.hash)).to.deep.equal(payload)
  })
})

describe('reference script', () => {
  it('ships the reference Playwright script', () => {
    const path = referenceScriptPath()
    expect(path.endsWith(join('scripts', 'preview-with-playwright.mjs'))).to.equal(true)
    expect(existsSync(path)).to.equal(true)
  })

  it('points the reference command at that script and the render URL', () => {
    const renderUrl = 'https://app.example/preview?device=iphone-14#config=gz:abc'
    const command = buildReferenceCommand({renderUrl})

    expect(command).to.contain(`node "${referenceScriptPath()}"`)
    expect(command).to.contain(`--url "${renderUrl}"`)
    expect(command).to.contain('--out "preview.png"')
    expect(command).to.contain('--package=playwright')
  })
})
})
