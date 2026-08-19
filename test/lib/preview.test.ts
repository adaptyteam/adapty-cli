import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'

import {buildRenderUrl, normalizePreviewConfig, resolveRenderUrl} from '../../src/lib/preview.js'

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

    it('omits the screen param when none was asked for, letting the page pick the first', () => {
      const payload = normalizePreviewConfig(FIXTURE)
      const url = new URL(
        buildRenderUrl('https://app.example/preview', {device: 'iphone-14', orientation: 'portrait'}, payload),
      )

      expect(url.searchParams.get('screen')).to.equal(null)
      expect(url.searchParams.get('device')).to.equal('iphone-14')
      expect(url.searchParams.get('orientation')).to.equal('portrait')
    })

    it('carries a real config through the gzipped fragment, unprefixed and padding-free', () => {
      const payload = normalizePreviewConfig(FIXTURE)
      const url = new URL(
        buildRenderUrl(
          'https://app.example/preview',
          {device: 'ipad-pro', orientation: 'landscape', screen: 'offer'},
          payload,
        ),
      )

      expect(url.searchParams.get('screen')).to.equal('offer')
      expect(url.searchParams.get('orientation')).to.equal('landscape')
      expect(url.hash.slice('#config='.length)).to.match(/^[\w-]+$/)
      expect(decodeConfigFragment(url.hash)).to.deep.equal(payload)
    })
  })
})
