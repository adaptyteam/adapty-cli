import {expect} from 'chai'

import {decideConfirmation, renderPreview} from '../../src/lib/confirm.js'

describe('confirmation', () => {
  it('applies without asking when --yes is given, whatever the terminal is', () => {
    expect(decideConfirmation({isTty: true, json: false, yes: true})).to.equal('proceed')
    expect(decideConfirmation({isTty: false, json: true, yes: true})).to.equal('proceed')
  })

  it('asks only when a human is on the other end', () => {
    expect(decideConfirmation({isTty: true, json: false, yes: false})).to.equal('ask')
  })

  it('refuses instead of hanging when nobody can answer', () => {
    expect(decideConfirmation({isTty: false, json: false, yes: false})).to.equal('refuse')
    expect(decideConfirmation({isTty: true, json: true, yes: false})).to.equal('refuse')
  })

  it('shows the summary, the call and the exact body that will be sent', () => {
    const preview = renderPreview({
      body: {daily_budget_amount: {amount: '50', currency: 'USD'}, name: 'Winter push'},
      method: 'POST',
      path: '/campaigns/',
      summary: 'Create campaign Winter push',
    })
    expect(preview).to.contain('Create campaign Winter push')
    expect(preview).to.contain('POST /campaigns/')
    expect(preview).to.contain('"amount": "50"')
  })

  it('omits the body for calls that carry none', () => {
    const preview = renderPreview({method: 'POST', path: '/automations/x/run/', summary: 'Run the rule for real'})
    expect(preview.split('\n')).to.have.length(2)
  })
})
