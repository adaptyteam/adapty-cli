import {expect} from 'chai'

import {firstScreenId, normalizePreviewConfig} from '../../src/lib/preview-config.js'
import {buildRenderUrl, resolveRenderUrl} from '../../src/lib/preview-render.js'

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

  it('carries small configs in the fragment fallback', () => {
    const url = new URL(buildRenderUrl('https://app.example/preview', {device: 'iphone-14'}, '{"flow":{}}'))
    expect(decodeURIComponent(url.hash)).to.equal('#config={"flow":{}}')
  })
})
})
