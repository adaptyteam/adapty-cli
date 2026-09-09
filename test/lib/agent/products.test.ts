import {expect} from 'chai'

import {integrateAction} from '../../../src/lib/agent/actions/integrate.js'
import {collectStoreProducts, renderStoreProducts} from '../../../src/lib/agent/products.js'
import {buildActionPrompt, type PromptContext} from '../../../src/lib/agent/prompt.js'

const CTX: PromptContext = {
  appId: 'app-1',
  cliCommand: 'node "/x/bin/run.js"',
  paywallApproach: 'custom',
  platformReference: 'PLAYBOOK',
  project: {name: 'demo', path: '/apps/demo', platform: 'flutter', platformLabel: 'Flutter'},
  sdkKey: 'public_live_abc',
}

describe('store products', () => {
  it('renders one line per product with cross-store and base-plan semantics', () => {
    const rendered = renderStoreProducts([
      {appStoreId: 'premium_monthly', googleBasePlanId: 'monthly-autorenew', googlePlayId: 'premium_monthly', period: 'monthly'},
      {appStoreId: 'premium_lifetime', googlePlayId: 'premium_lifetime', period: 'lifetime'},
      {appStoreId: 'ios_only_yearly', period: 'annual'},
    ])
    expect(rendered).to.include('period: monthly | App Store: premium_monthly | Google Play: premium_monthly (base plan: monthly-autorenew)')
    expect(rendered).to.include('period: lifetime | App Store: premium_lifetime | Google Play: premium_lifetime')
    expect(rendered).to.include('- period: annual | App Store: ios_only_yearly')
    expect(rendered).to.include('store IDs are immutable')
  })

  it('headless collection always resolves to skip without prompting', async () => {
    // Non-TTY: the store select returns its default ('skip') immediately.
    expect(await collectStoreProducts('flutter')).to.deep.equal([])
  })

  it('integrate prompt switches from defer-to-checklist to create-now when products are provided', () => {
    const withProducts = buildActionPrompt(integrateAction, {
      ...CTX,
      storeProducts: renderStoreProducts([{appStoreId: 'premium_monthly', period: 'monthly'}]),
    })
    expect(withProducts).to.include('<store_products>')
    expect(withProducts).to.include('create each product below')
    expect(withProducts).to.not.include('Real IDs unknown -> create no products')

    const without = buildActionPrompt(integrateAction, CTX)
    expect(without).to.not.include('<store_products>')
    expect(without).to.include('Real IDs unknown -> create no products')
  })
})
