import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import sinon from 'sinon'

import {assertFetch, mockFetch, restoreFetch} from '../../helpers/mock-fetch.js'

describe('auth login', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    delete process.env.ADAPTY_TOKEN
    fetchStub = mockFetch([
      {
        device_code: 'test-device-code',
        expires_in: 300,
        interval: 0,
        user_code: 'TEST-CODE',
        verification_uri: 'https://auth.adapty.io/activate',
        verification_uri_complete: 'https://auth.adapty.io/activate?code=TEST-CODE',
      },
      {
        access_token: 'new-token',
        expires_in: 86_400,
        token_type: 'Bearer',
        user: {email: 'test@example.com', name: 'Test User'},
      },
    ])
  })

  afterEach(() => {
    restoreFetch(fetchStub)
  })

  it('calls POST /auth/device then POST /auth/token', async () => {
    await runCommand('auth login')
    expect(fetchStub.callCount).to.equal(2)
    assertFetch({body: {client_id: 'adapty-cli'}, callIndex: 0, method: 'POST', path: '/auth/device/', stub: fetchStub})
    assertFetch({
      body: {
        device_code: 'test-device-code',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      callIndex: 1,
      method: 'POST',
      path: '/auth/token/',
      stub: fetchStub,
    })
  })
})
