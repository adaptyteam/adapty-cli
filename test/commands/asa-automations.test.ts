import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sinon from 'sinon'

import {ASA_API_BASE, assertFetch, mockFetch, restoreFetch, TEST_APP_ID, TEST_RESOURCE_ID} from '../helpers/mock-fetch.js'

const AD_GROUP_A = '770e8400-e29b-41d4-a716-446655440002'
const AD_GROUP_B = '880e8400-e29b-41d4-a716-446655440003'

const CONDITION = {
  args: 50,
  operand: {date_range_type: 'last_7_d', field: 'taps', field_type: 'base_field'},
  operator: 'gte',
}

const CREATED = {automation: {id: TEST_RESOURCE_ID, name: 'ST harvester'}}

function rule(operateWith: string, params: unknown, actionType = 'add-as-keyword-to'): Record<string, unknown> {
  return {
    actions: [{params, type: actionType}],
    apply_to: [{internal_id: TEST_APP_ID, type: 'app'}],
    conditions: [CONDITION],
    id: TEST_RESOURCE_ID,
    name: 'ST harvester',
    operate_with: operateWith,
    run_frequency: {hour: 8, type: 'daily'},
    status: 1,
  }
}

async function ruleFile(body: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'asa-cli-'))
  const path = join(dir, 'rule.json')
  await writeFile(path, JSON.stringify(body))
  return path
}

const sentBody = (stub: sinon.SinonStub, callIndex: number): Record<string, unknown> =>
  JSON.parse(stub.getCall(callIndex).args[1].body as string)

const sentParams = (stub: sinon.SinonStub, callIndex: number): Record<string, unknown> => {
  const {actions} = sentBody(stub, callIndex) as {actions: Array<{params: Record<string, unknown>}>}
  return actions[0].params
}

describe('asa automations add-as-keyword action flags', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    process.env.ADAPTY_TOKEN = 'dev_live_test'
    delete process.env.ADAPTY_ASA_API_URL
  })

  afterEach(() => {
    restoreFetch(fetchStub)
    delete process.env.ADAPTY_TOKEN
  })

  it('create collects every --target-ad-group into targets.internal_ids', async () => {
    const path = await ruleFile(rule('search-term', {}))
    fetchStub = mockFetch([CREATED])
    await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A} --target-ad-group ${AD_GROUP_B} --match-type EXACT --cpt-bid-type search_term_current_cpt`,
    )

    assertFetch({base: ASA_API_BASE, callIndex: 0, method: 'POST', path: '/automations/', stub: fetchStub})
    expect(sentParams(fetchStub, 0)).to.deep.equal({
      cpt_bid: {type: 'search_term_current_cpt', value: null},
      match_type: 'EXACT',
      negate: {enabled: false, type: null},
      skip_enable_duplicate_keywords: false,
      targets: {internal_ids: [AD_GROUP_A, AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('create lets the flags win over the params already in the file', async () => {
    const path = await ruleFile(
      rule('search-term', {
        cpt_bid: {type: 'ad_group_default_bid', value: null},
        match_type: 'BROAD',
        negate: {enabled: false, type: null},
        skip_enable_duplicate_keywords: false,
        targets: {internal_ids: [AD_GROUP_A], type: 'ad-group'},
      }),
    )
    fetchStub = mockFetch([CREATED])
    await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_B} --match-type EXACT --cpt-bid-type set_to --cpt-bid 1.50 --negate campaign --skip-enable-duplicates`,
    )

    expect(sentParams(fetchStub, 0)).to.deep.equal({
      cpt_bid: {type: 'set_to', value: 1.5},
      match_type: 'EXACT',
      negate: {enabled: true, type: 'campaign'},
      skip_enable_duplicate_keywords: true,
      targets: {internal_ids: [AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('create keeps the params the file already carries when no flag overrides them', async () => {
    const path = await ruleFile(
      rule('targeting-keyword', {
        cpt_bid: {type: 'keyword_current_bid', value: null},
        match_type: 'BROAD',
        pause_in_original_ad_group: true,
        targets: {internal_ids: [AD_GROUP_A], type: 'ad-group'},
      }),
    )
    fetchStub = mockFetch([CREATED])
    await runCommand(`asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_B}`)

    expect(sentParams(fetchStub, 0)).to.deep.equal({
      cpt_bid: {type: 'keyword_current_bid', value: null},
      match_type: 'BROAD',
      pause_in_original_ad_group: true,
      targets: {internal_ids: [AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('create refuses a rule left without target ad groups', async () => {
    const path = await ruleFile(rule('search-term', {}))
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(
      `asa automations create --yes --file ${path} --match-type EXACT --cpt-bid-type search_term_current_cpt`,
    )

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('--target-ad-group')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create refuses --negate on a targeting-keyword rule and names the applicable flags', async () => {
    const path = await ruleFile(rule('targeting-keyword', {}))
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A} --match-type EXACT --cpt-bid-type keyword_current_bid --negate campaign`,
    )

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('--negate')
    expect(error?.message).to.contain('--pause-original')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create refuses --pause-original on a search-term rule', async () => {
    const path = await ruleFile(rule('search-term', {}))
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A} --match-type EXACT --cpt-bid-type search_term_current_cpt --pause-original`,
    )

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('--pause-original')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create refuses params built from scratch without --cpt-bid-type and --match-type', async () => {
    const path = await ruleFile(rule('search-term', {}))
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A}`,
    )

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('--match-type')
    expect(error?.message).to.contain('--cpt-bid-type')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create requires --cpt-bid with --cpt-bid-type set_to and rejects it with the other types', async () => {
    const path = await ruleFile(rule('search-term', {}))
    fetchStub = mockFetch([CREATED])

    const missing = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A} --match-type EXACT --cpt-bid-type set_to`,
    )
    expect(missing.error?.oclif?.exit).to.equal(2)
    expect(missing.error?.message).to.contain('--cpt-bid')

    const extra = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_A} --match-type EXACT --cpt-bid-type search_term_current_cpt --cpt-bid 1.20`,
    )
    expect(extra.error?.oclif?.exit).to.equal(2)
    expect(extra.error?.message).to.contain('set_to')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create refuses a rule whose single action is not add-as-keyword-to and names the actual type', async () => {
    const path = await ruleFile(rule('targeting-keyword', {targets: {ids: [AD_GROUP_A], target_type: 'AD_GROUP'}}, 'add-as-negative-keyword'))
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(
      `asa automations create --yes --file ${path} --target-ad-group ${AD_GROUP_B} --match-type EXACT --cpt-bid-type keyword_current_bid`,
    )

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('add-as-negative-keyword')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('create refuses a rule file that does not carry exactly one action', async () => {
    const none = await ruleFile({conditions: [CONDITION], name: 'no actions', operate_with: 'search-term', status: 1})
    fetchStub = mockFetch([CREATED])
    const {error} = await runCommand(`asa automations create --yes --file ${none}`)

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('exactly one action')
    expect(fetchStub.callCount).to.equal(0)
  })

  it('update reads the rule, rebuilds the action and sends the whole actions list', async () => {
    fetchStub = mockFetch([
      rule('search-term', {
        cpt_bid: {type: 'search_term_current_cpt', value: null},
        match_type: 'BROAD',
        negate: {enabled: true, type: 'ad-group'},
        skip_enable_duplicate_keywords: true,
        targets: {internal_ids: [AD_GROUP_A], type: 'ad-group'},
      }),
      CREATED,
    ])
    await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --target-ad-group ${AD_GROUP_B}`)

    assertFetch({
      base: ASA_API_BASE,
      callIndex: 0,
      method: 'GET',
      path: `/automations/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })
    assertFetch({
      base: ASA_API_BASE,
      callIndex: 1,
      method: 'PUT',
      path: `/automations/${TEST_RESOURCE_ID}/`,
      stub: fetchStub,
    })

    const body = sentBody(fetchStub, 1) as {actions: Array<{params: unknown; type: string}>}
    expect(body.actions).to.have.length(1)
    expect(body.actions[0].type).to.equal('add-as-keyword-to')
    expect(body.actions[0].params).to.deep.equal({
      cpt_bid: {type: 'search_term_current_cpt', value: null},
      match_type: 'BROAD',
      negate: {enabled: true, type: 'ad-group'},
      skip_enable_duplicate_keywords: true,
      targets: {internal_ids: [AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('update rebuilds params that carry the negative-keyword shape and drops the stray keys', async () => {
    fetchStub = mockFetch([
      rule('search-term', {pause_in_original_ad_group: false, targets: {ids: [AD_GROUP_A], target_type: 'AD_GROUP'}}),
      CREATED,
    ])
    await runCommand(
      `asa automations update --yes ${TEST_RESOURCE_ID} --target-ad-group ${AD_GROUP_B} --match-type EXACT --cpt-bid-type search_term_current_cpt`,
    )

    expect(sentParams(fetchStub, 1)).to.deep.equal({
      cpt_bid: {type: 'search_term_current_cpt', value: null},
      match_type: 'EXACT',
      negate: {enabled: false, type: null},
      skip_enable_duplicate_keywords: false,
      targets: {internal_ids: [AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('update refuses a broken rule until the missing required flags are supplied', async () => {
    fetchStub = mockFetch([
      rule('search-term', {pause_in_original_ad_group: false, targets: {ids: [AD_GROUP_A], target_type: 'AD_GROUP'}}),
      CREATED,
    ])
    const {error} = await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --target-ad-group ${AD_GROUP_B}`)

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('--match-type')
    expect(error?.message).to.contain('--cpt-bid-type')
    expect(fetchStub.callCount).to.equal(1)
  })

  it('update refuses a rule whose single action is not add-as-keyword-to', async () => {
    fetchStub = mockFetch([
      rule('search-term', {targets: {ids: [AD_GROUP_A], target_type: 'AD_GROUP'}}, 'add-as-negative-keyword'),
      CREATED,
    ])
    const {error} = await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --target-ad-group ${AD_GROUP_B}`)

    expect(error?.oclif?.exit).to.equal(2)
    expect(error?.message).to.contain('add-as-negative-keyword')
    expect(fetchStub.callCount).to.equal(1)
  })

  it('update takes the action from --file over the stored rule', async () => {
    const path = await ruleFile({
      actions: [
        {
          params: {
            cpt_bid: {type: 'keyword_current_bid', value: null},
            match_type: 'BROAD',
            pause_in_original_ad_group: false,
            targets: {internal_ids: [AD_GROUP_A], type: 'ad-group'},
          },
          type: 'add-as-keyword-to',
        },
      ],
      operate_with: 'targeting-keyword',
    })
    fetchStub = mockFetch([rule('targeting-keyword', {}), CREATED])
    await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --file ${path} --target-ad-group ${AD_GROUP_B} --pause-original`)

    expect(sentParams(fetchStub, 1)).to.deep.equal({
      cpt_bid: {type: 'keyword_current_bid', value: null},
      match_type: 'BROAD',
      pause_in_original_ad_group: true,
      targets: {internal_ids: [AD_GROUP_B], type: 'ad-group'},
    })
  })

  it('update without action flags stays a single call', async () => {
    fetchStub = mockFetch([CREATED])
    await runCommand(`asa automations update --yes ${TEST_RESOURCE_ID} --stop`)

    expect(fetchStub.callCount).to.equal(1)
    expect(sentBody(fetchStub, 0)).to.deep.equal({status: 0})
  })
})
