import {expect} from 'chai'
import sinon from 'sinon'

import {type AgentRunEvent, telemetryDisabled, trackAgentRun} from '../../../src/lib/agent/telemetry.js'

const EVENT: AgentRunEvent = {
  appId: 'app-1',
  command: 'integrate',
  driver: 'claude',
  durationS: 120,
  isDev: true,
  ok: true,
  paywallApproach: 'flow_builder',
  platform: 'flutter',
  rating: 4,
  version: '0.2.0',
}

describe('telemetry', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}'))
    process.env.ADAPTY_FEEDBACK_URL = 'http://localhost:1/feedback'
  })

  afterEach(() => {
    fetchStub.restore()
    delete process.env.ADAPTY_FEEDBACK_URL
    delete process.env.ADAPTY_TELEMETRY_DISABLED
    delete process.env.DO_NOT_TRACK
  })

  it('posts one event with the funnel fields', async () => {
    await trackAgentRun(EVENT)
    expect(fetchStub.calledOnce).to.equal(true)
    const body = JSON.parse(fetchStub.firstCall.args[1].body as string)
    expect(body.platform).to.equal('flutter')
    expect(body.rating).to.equal(4)
    expect(body.slack_text).to.include('CLI integrate')
    expect(body.slack_text).to.include('dev')
  })

  it('is disabled by ADAPTY_TELEMETRY_DISABLED=1 and DO_NOT_TRACK=1', async () => {
    for (const flag of ['ADAPTY_TELEMETRY_DISABLED', 'DO_NOT_TRACK']) {
      process.env[flag] = '1'
      expect(telemetryDisabled()).to.equal(true)
      await trackAgentRun(EVENT)
      delete process.env[flag]
    }

    expect(fetchStub.called).to.equal(false)
  })

  it('never surfaces network errors', async () => {
    fetchStub.rejects(new Error('offline'))
    await trackAgentRun(EVENT) // must resolve, not throw
  })
})
