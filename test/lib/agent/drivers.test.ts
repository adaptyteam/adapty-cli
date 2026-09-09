import {expect} from 'chai'

import {DRIVER_IDS, DRIVERS} from '../../../src/lib/agent/drivers/index.js'
import {type AgentRunOptions, runPlainText, runStreamJson, withAuthCheck} from '../../../src/lib/agent/drivers/shared.js'

/** Run a runner against `node -e <script>` so tests exercise real spawn/stream plumbing without any agent installed. */
function fakeAgent(script: string): {args: string[]; bin: string} {
  return {args: ['-e', script], bin: 'node'}
}

function runOpts(onStatus?: (text: string) => void): AgentRunOptions {
  return {cwd: process.cwd(), onStatus, prompt: 'irrelevant'}
}

describe('agent drivers', () => {
  describe('registry', () => {
    it('has unique ids and bins', () => {
      const ids = DRIVERS.map((d) => d.id)
      const bins = DRIVERS.map((d) => d.bin)
      expect(new Set(ids).size).to.equal(DRIVERS.length)
      expect(new Set(bins).size).to.equal(DRIVERS.length)
    })

    it('DRIVER_IDS mirrors the registry', () => {
      expect(DRIVER_IDS).to.deep.equal(DRIVERS.map((d) => d.id))
    })

    it('every driver carries the hints the wizard prints', () => {
      for (const d of DRIVERS) {
        expect(d.displayName, d.id).to.not.be.empty
        expect(d.installHint, d.id).to.not.be.empty
        expect(d.loginHint, d.id).to.not.be.empty
        expect(d.resumeHint, d.id).to.include('ADAPTY_SETUP.md')
        expect(d.authErrorPattern, d.id).to.be.instanceOf(RegExp)
      }
    })
  })

  describe('runStreamJson', () => {
    it('surfaces [STATUS] blocks and takes finalText/ok from the result event', async () => {
      const statuses: string[] = []
      const script = `
        console.log(JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'Working.\\n[STATUS] Installing the SDK'}]}}))
        console.log('not json - ignored')
        console.log(JSON.stringify({type: 'result', subtype: 'success', is_error: false, result: 'All done'}))
      `
      const result = await runStreamJson(fakeAgent(script), runOpts((s) => statuses.push(s)))
      expect(statuses).to.deep.equal(['Installing the SDK'])
      expect(result).to.deep.equal({finalText: 'All done', ok: true})
    })

    it('fails when the result event reports an error', async () => {
      const script = `console.log(JSON.stringify({type: 'result', subtype: 'error', is_error: true, result: 'boom'}))`
      const result = await runStreamJson(fakeAgent(script), runOpts())
      expect(result.ok).to.equal(false)
      expect(result.finalText).to.equal('boom')
    })

    it('surfaces every [STATUS] in a single text block', async () => {
      const statuses: string[] = []
      const script = `
        console.log(JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: '[STATUS] Installing SDK\\n[STATUS] Wiring paywall'}]}}))
        console.log(JSON.stringify({type: 'result', subtype: 'success', is_error: false, result: 'done'}))
      `
      await runStreamJson(fakeAgent(script), runOpts((s) => statuses.push(s)))
      expect(statuses).to.deep.equal(['Installing SDK', 'Wiring paywall'])
    })

    it('falls back to the exit code when no result event arrives and exitCodeFallback is set', async () => {
      const script = `console.log(JSON.stringify({type: 'assistant', message: {content: []}}))`
      const strict = await runStreamJson(fakeAgent(script), runOpts())
      expect(strict.ok, 'default stays strict').to.equal(false)
      const lenient = await runStreamJson({...fakeAgent(script), exitCodeFallback: true}, runOpts())
      expect(lenient.ok).to.equal(true)
    })

    it('honors a custom okFromResult', async () => {
      const script = `console.log(JSON.stringify({type: 'result', is_error: false, result: 'done'}))`
      const strict = await runStreamJson(fakeAgent(script), runOpts())
      expect(strict.ok, 'default requires subtype success').to.equal(false)
      const lenient = await runStreamJson(
        {...fakeAgent(script), okFromResult: (msg) => msg.is_error !== true},
        runOpts(),
      )
      expect(lenient.ok).to.equal(true)
    })

    it('falls back to the stderr tail when the agent dies without a result', async () => {
      const script = `console.error('please run /login'); process.exit(2)`
      const result = await runStreamJson(fakeAgent(script), runOpts())
      expect(result.ok).to.equal(false)
      expect(result.finalText).to.equal('please run /login')
    })
  })

  describe('runPlainText', () => {
    it('routes [STATUS] lines to the spinner and keeps the rest as finalText', async () => {
      const statuses: string[] = []
      const script = `
        console.log('[STATUS] Adding the dependency')
        console.log('Integration complete.')
        console.log('[STATUS] Wrapping up')
      `
      const result = await runPlainText(fakeAgent(script), runOpts((s) => statuses.push(s)))
      expect(statuses).to.deep.equal(['Adding the dependency', 'Wrapping up'])
      expect(result).to.deep.equal({finalText: 'Integration complete.', ok: true})
    })

    it('falls back to the stderr tail on a silent failure', async () => {
      const script = `console.error('not authenticated'); process.exit(1)`
      const result = await runPlainText(fakeAgent(script), runOpts())
      expect(result).to.deep.equal({finalText: 'not authenticated', ok: false})
    })

    it('does not report success when the agent exits 0 without any stdout', async () => {
      const script = `console.error('not authenticated'); process.exit(0)`
      const result = await runPlainText(fakeAgent(script), runOpts())
      expect(result).to.deep.equal({finalText: 'not authenticated', ok: false})
    })

    it('keeps lines that only mention [STATUS] mid-sentence', async () => {
      const statuses: string[] = []
      const script = `console.log('Updated [STATUS] handling in Auth.kt')`
      const result = await runPlainText(fakeAgent(script), runOpts((s) => statuses.push(s)))
      expect(statuses).to.deep.equal([])
      expect(result).to.deep.equal({finalText: 'Updated [STATUS] handling in Auth.kt', ok: true})
    })
  })

  describe('withAuthCheck', () => {
    it('marks failures matching the driver auth pattern', () => {
      const result = withAuthCheck({finalText: 'Error: not logged in', ok: false}, /not logged in/i)
      expect(result.failureReason).to.equal('auth')
    })

    it('leaves other failures and successes alone', () => {
      expect(withAuthCheck({finalText: 'segfault', ok: false}, /not logged in/i).failureReason).to.equal(undefined)
      expect(withAuthCheck({finalText: 'not logged in', ok: true}, /not logged in/i).failureReason).to.equal(undefined)
    })
  })
})
