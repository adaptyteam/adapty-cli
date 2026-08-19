import {expect} from 'chai'

import {APP_URL_ENV_VAR, appUrl, onAppHost} from '../../src/lib/app-url.js'

describe('app url', () => {
  afterEach(() => {
    delete process.env[APP_URL_ENV_VAR]
  })

  it('builds a route on the production dashboard by default', () => {
    expect(appUrl('/flow-preview').toString()).to.equal('https://app.adapty.io/flow-preview')
  })

  it('builds a route on the configured host', () => {
    process.env[APP_URL_ENV_VAR] = 'http://localhost:3000'
    expect(appUrl('/flow-preview').toString()).to.equal('http://localhost:3000/flow-preview')
  })

  it('rejects a host it cannot parse', () => {
    process.env[APP_URL_ENV_VAR] = 'not a url'
    expect(() => appUrl('/flow-preview')).to.throw(APP_URL_ENV_VAR)
  })

  it('leaves an API-issued link alone when no host is configured', () => {
    expect(onAppHost('https://auth.adapty.io/activate?code=TEST-CODE')).to.equal(
      'https://auth.adapty.io/activate?code=TEST-CODE',
    )
  })

  it('moves an API-issued link onto the configured host, keeping path, query and hash', () => {
    process.env[APP_URL_ENV_VAR] = 'http://localhost:3000'
    expect(onAppHost('https://auth.adapty.io/activate?code=TEST-CODE#x')).to.equal(
      'http://localhost:3000/activate?code=TEST-CODE#x',
    )
  })

  it('passes through a link it cannot parse', () => {
    process.env[APP_URL_ENV_VAR] = 'http://localhost:3000'
    expect(onAppHost('not a url')).to.equal('not a url')
  })
})
