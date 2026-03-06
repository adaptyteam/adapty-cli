import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth logout', () => {
  it('handles logout', async () => {
    const {stdout} = await runCommand('auth logout')
    const valid = stdout.includes('Not currently authenticated') || stdout.includes('Logged out')
    expect(valid).to.be.true
  })
})
