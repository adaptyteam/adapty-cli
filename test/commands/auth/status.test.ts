import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth status', () => {
  it('shows not authenticated when no config', async () => {
    const {stdout} = await runCommand('auth status')
    expect(stdout).to.contain('Not authenticated')
  })

  it('returns json when --json flag passed', async () => {
    const {stdout} = await runCommand('auth status --json')
    const result = JSON.parse(stdout)
    expect(result.authenticated).to.equal(false)
  })
})
