import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'

import {buildRenderUrl, firstScreenId, normalizePreviewConfig, resolveRenderUrl} from '../../src/lib/preview.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/flow-config.json', import.meta.url))
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown

/** Decodes the fragment the way the render page does, to prove the wire format round-trips. */
function decodeConfigFragment(hash: string): unknown {
  const encoded = new URLSearchParams(hash.slice(1)).get('config')
  if (!encoded?.startsWith('gz:')) throw new Error(`Not a gzipped fragment: ${encoded}`)
  return JSON.parse(gunzipSync(Buffer.from(encoded.slice(3), 'base64url')).toString('utf8')) as unknown
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

    it('finds the first screen id, and none when screens is not an array', () => {
      expect(firstScreenId({screens: [{id: 'welcome'}, {id: 'offer'}]})).to.equal('welcome')
      expect(firstScreenId({screens: {welcome: {}}})).to.equal(undefined)
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

    it('omits the screen param when unknown', () => {
      const payload = normalizePreviewConfig(FIXTURE)
      const url = new URL(buildRenderUrl('https://app.example/preview', {device: 'iphone-14'}, payload))

      expect(url.searchParams.get('screen')).to.equal(null)
      expect(url.searchParams.get('device')).to.equal('iphone-14')
    })

    it('carries a real config through the gzipped fragment', () => {
      const payload = normalizePreviewConfig(FIXTURE)
      const url = new URL(
        buildRenderUrl('https://app.example/preview', {device: 'iphone-14', screen: 'offer'}, payload),
      )

      expect(url.searchParams.get('screen')).to.equal('offer')
      expect(url.hash.slice('#config=gz:'.length)).to.match(/^[\w-]+$/)
      expect(decodeConfigFragment(url.hash)).to.deep.equal(payload)
    })
  })
})
