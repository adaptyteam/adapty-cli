import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import type {PreviewResult} from '../../src/commands/preview.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/flow-config.json', import.meta.url))

describe('preview command', () => {
  afterEach(() => {
    delete process.env.ADAPTY_PREVIEW_RENDER_URL
  })

  it('prepares a render URL, a payload file and a reference command', async () => {
    process.env.ADAPTY_PREVIEW_RENDER_URL = 'https://app.example/preview'
    const {result} = await runCommand<PreviewResult>(['preview', FIXTURE_PATH, '--json'])
    if (!result) throw new Error('preview returned no result')

    expect(result.renderUrl.startsWith('https://app.example/preview?screen=welcome&device=iphone-14#config=gz:')).to.equal(
      true,
    )
    expect(result.referenceCommand).to.contain(result.renderUrl)
    expect(JSON.parse(readFileSync(result.payloadPath, 'utf8'))).to.have.keys(['flow', 'remoteConfigs'])
  })

  it('writes the payload where --payload-out asks', async () => {
    process.env.ADAPTY_PREVIEW_RENDER_URL = 'https://app.example/preview'
    const outPath = join(mkdtempSync(join(tmpdir(), 'adapty-preview-test-')), 'payload.json')
    const {result} = await runCommand<PreviewResult>(['preview', FIXTURE_PATH, '--payload-out', outPath, '--json'])

    expect(result?.payloadPath).to.equal(outPath)
    expect(JSON.parse(readFileSync(outPath, 'utf8'))).to.have.keys(['flow', 'remoteConfigs'])
  })

  it('fails without a render URL', async () => {
    const {error} = await runCommand(['preview', FIXTURE_PATH])
    expect(error?.message).to.contain('ADAPTY_PREVIEW_RENDER_URL')
  })
})
