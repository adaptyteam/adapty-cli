import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import type {PreviewResult} from '../../src/commands/flows/config/preview.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/flow-config.json', import.meta.url))

describe('flows config preview', () => {
  beforeEach(() => {
    process.env.ADAPTY_APP_URL = 'https://app.example'
  })

  afterEach(() => {
    delete process.env.ADAPTY_APP_URL
  })

  it('prints a render URL carrying the config in the fragment', async () => {
    const {result} = await runCommand<PreviewResult>(['flows:config:preview', FIXTURE_PATH, '--json'])
    if (!result) throw new Error('preview returned no result')

    expect(
      result.render_url.startsWith('https://app.example/flow-preview?device=iphone-14&orientation=portrait#config='),
    ).to.equal(true)
    expect(result.payload_path).to.equal(undefined)
  })

  it('writes the payload and drops the fragment with --payload-out', async () => {
    const outPath = join(mkdtempSync(join(tmpdir(), 'adapty-preview-test-')), 'payload.json')
    const {result} = await runCommand<PreviewResult>([
      'flows:config:preview',
      FIXTURE_PATH,
      '--payload-out',
      outPath,
      '--json',
    ])

    expect(result?.payload_path).to.equal(outPath)
    expect(result?.render_url).to.not.contain('#config=')
    expect(JSON.parse(readFileSync(outPath, 'utf8'))).to.have.keys(['flow', 'remoteConfigs'])
  })

  it('puts the requested screen and orientation in the URL', async () => {
    const {result} = await runCommand<PreviewResult>([
      'flows:config:preview',
      FIXTURE_PATH,
      '--screen',
      'offer',
      '--orientation',
      'landscape',
      '--json',
    ])

    expect(result?.render_url).to.contain('screen=offer')
    expect(result?.render_url).to.contain('orientation=landscape')
  })

  it('rejects an orientation the render page does not accept', async () => {
    const {error} = await runCommand(['flows:config:preview', FIXTURE_PATH, '--orientation', 'sideways'])
    expect(error?.message).to.contain('sideways')
  })

  it('never repeats the config: --json output is about the size of one fragment', async () => {
    const {result} = await runCommand<PreviewResult>(['flows:config:preview', FIXTURE_PATH, '--json'])
    if (!result) throw new Error('preview returned no result')

    const fragment = result.render_url.slice(result.render_url.indexOf('#config=') + '#config='.length)
    expect(JSON.stringify(result).length).to.be.lessThan(fragment.length * 2)
  })

  it('prints the URL alone when stdout is piped, so it can be composed', async () => {
    const {stdout} = await runCommand(['flows:config:preview', FIXTURE_PATH])

    expect(stdout.trim().split('\n')).to.have.length(1)
    expect(stdout.trim().startsWith('https://app.example/flow-preview?')).to.equal(true)
  })
})
