import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth logout', () => {
  it('shows not authenticated when no config', async () => {
    const {stdout} = await runCommand('auth logout')
    expect(stdout).to.contain('Not currently authenticated')
  })
})
