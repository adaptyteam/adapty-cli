import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'

import {APP_URL_ENV_VAR, buildRenderUrl, normalizePreviewConfig} from '../../src/lib/preview.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/flow-config.json', import.meta.url))
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown

/**
 * Decodes the fragment the way the render page does, to prove the wire format round-trips:
 * the page reads `config=` out of the hash by regex and gunzips it, with no prefix to strip.
 */
function decodeConfigFragment(hash: string): unknown {
  const encoded = /(?:^|[#&])config=([^&]*)/.exec(hash)?.[1]
  if (!encoded) throw new Error(`No config fragment in ${hash}`)
  return JSON.parse(gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8')) as unknown
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
      const flow = {locales: [{code: 'en'}], screens: [{id: 'welcome'}], theme: {}}
      expect(normalizePreviewConfig(flow)).to.deep.equal({flow, remoteConfigs: []})
    })

    it('rejects a config the render page would reject: no screens array', () => {
      expect(() => normalizePreviewConfig({hello: 'world'})).to.throw('`screens` must be an array')
      expect(() => normalizePreviewConfig({locales: [], theme: {}})).to.throw('`screens` must be an array')
      expect(() => normalizePreviewConfig({config: {theme: {}}})).to.throw('`screens` must be an array')
      expect(() => normalizePreviewConfig({screens: {welcome: {}}})).to.throw('`screens` must be an array')
      expect(() => normalizePreviewConfig([1, 2])).to.throw('must contain a JSON object')
    })
  })

  describe('render url', () => {
    afterEach(() => {
      delete process.env[APP_URL_ENV_VAR]
    })

    const target = {device: 'iphone-14', orientation: 'portrait'} as const

    it('defaults to the dashboard host and the fixed preview route', () => {
      const url = new URL(buildRenderUrl(target, normalizePreviewConfig(FIXTURE)))

      expect(url.origin).to.equal('https://app.adapty.io')
      expect(url.pathname).to.equal('/flow-preview')
    })

    it('takes the host from ADAPTY_APP_URL, keeping the route', () => {
      process.env[APP_URL_ENV_VAR] = 'http://localhost:3000'
      const url = new URL(buildRenderUrl(target, normalizePreviewConfig(FIXTURE)))

      expect(url.origin).to.equal('http://localhost:3000')
      expect(url.pathname).to.equal('/flow-preview')
    })

    it('rejects a host it cannot parse', () => {
      process.env[APP_URL_ENV_VAR] = 'not a url'
      expect(() => buildRenderUrl(target, normalizePreviewConfig(FIXTURE))).to.throw(APP_URL_ENV_VAR)
    })

    it('omits the screen param when none was asked for, letting the page pick the first', () => {
      const url = new URL(buildRenderUrl(target, normalizePreviewConfig(FIXTURE)))

      expect(url.searchParams.get('screen')).to.equal(null)
      expect(url.searchParams.get('device')).to.equal('iphone-14')
      expect(url.searchParams.get('orientation')).to.equal('portrait')
    })

    it('carries a real config through the gzipped fragment, unprefixed and padding-free', () => {
      const payload = normalizePreviewConfig(FIXTURE)
      const url = new URL(
        buildRenderUrl({device: 'ipad-pro', orientation: 'landscape', screen: 'offer'}, payload),
      )

      expect(url.searchParams.get('screen')).to.equal('offer')
      expect(url.searchParams.get('orientation')).to.equal('landscape')
      expect(url.hash.slice('#config='.length)).to.match(/^[\w-]+$/)
      expect(decodeConfigFragment(url.hash)).to.deep.equal(payload)
    })
  })
})
