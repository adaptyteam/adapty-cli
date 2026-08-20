import {expect} from 'chai'

import type {DashboardSnapshot} from '../../../src/lib/agent/wizard.js'

import {
  decideDashboardMode,
  fetchDashboardSnapshot,
  renderSnapshotLines,
  resolvePlacementDeveloperId,
  snapshotIsEmpty,
} from '../../../src/lib/agent/wizard.js'
import {ApiClient} from '../../../src/lib/api-client.js'
import {EMPTY_LIST_RESPONSE, mockFetch, restoreFetch, TEST_APP_ID} from '../../helpers/mock-fetch.js'

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    accessLevels: [],
    paywalls: [],
    placements: [],
    products: [],
    totals: {accessLevels: 0, paywalls: 0, placements: 0, products: 0},
    ...overrides,
  }
}

describe('wizard', () => {
  describe('dashboard snapshot', () => {
    it('fetches all four entity lists for the app', async () => {
      const stub = mockFetch([
        {data: [{id: 'al-1', sdk_id: 'premium', title: 'Premium'}], meta: {pagination: {count: 1, page: 1, pages: 1}}},
        EMPTY_LIST_RESPONSE,
        EMPTY_LIST_RESPONSE,
        {
          data: [{developer_id: 'onboarding', id: 'pl-1', title: 'Onboarding'}],
          meta: {pagination: {count: 1, page: 1, pages: 1}},
        },
      ])
      try {
        const result = await fetchDashboardSnapshot(new ApiClient({token: 'test-token'}), TEST_APP_ID)
        const paths = stub.getCalls().map((c) => (c.args[0] as string).split('?')[0])
        expect(paths).to.have.members([
          `https://api-admin.adapty.io/api/v1/developer/apps/${TEST_APP_ID}/access-levels/`,
          `https://api-admin.adapty.io/api/v1/developer/apps/${TEST_APP_ID}/products/`,
          `https://api-admin.adapty.io/api/v1/developer/apps/${TEST_APP_ID}/paywalls/`,
          `https://api-admin.adapty.io/api/v1/developer/apps/${TEST_APP_ID}/placements/`,
        ])
        expect(result.accessLevels).to.have.length(1)
        expect(result.placements[0].developer_id).to.equal('onboarding')
        expect(result.totals.accessLevels).to.equal(1)
        expect(snapshotIsEmpty(result)).to.equal(false)
      } finally {
        restoreFetch(stub)
      }
    })

    it('reports an app with no entities at all as empty', () => {
      expect(snapshotIsEmpty(snapshot())).to.equal(true)
      expect(
        snapshotIsEmpty(
          snapshot({products: [{access_level_id: 'x', id: 'p', period: 'monthly', title: 'M', vendor_products: {}}]}),
        ),
      ).to.equal(false)
    })

    it('names entities by their identifying field, drops empty rows, truncates at three', () => {
      const lines = renderSnapshotLines(
        snapshot({
          accessLevels: [
            {id: '1', sdk_id: 'premium', title: null},
            {id: '2', sdk_id: 'pro', title: null},
          ],
          placements: [{developer_id: 'onboarding_paywall', id: '3', title: 'Onboarding'}],
          products: [
            {access_level_id: 'x', id: 'a', period: 'monthly', title: 'Monthly', vendor_products: {}},
            {access_level_id: 'x', id: 'b', period: 'annual', title: 'Annual', vendor_products: {}},
            {access_level_id: 'x', id: 'c', period: 'lifetime', title: 'Lifetime', vendor_products: {}},
            {access_level_id: 'x', id: 'd', period: 'weekly', title: 'Weekly', vendor_products: {}},
            {access_level_id: 'x', id: 'e', period: 'weekly', title: 'Weekly 2', vendor_products: {}},
          ],
        }),
      )
      // Access levels by sdk_id, placements by developer_id, products/paywalls by title.
      expect(lines.some((l) => l.includes('premium, pro'))).to.equal(true)
      expect(lines.some((l) => l.includes('onboarding_paywall'))).to.equal(true)
      expect(lines.some((l) => l.includes('Monthly, Annual, Lifetime + 2 more'))).to.equal(true)
      // No paywalls -> no paywalls row.
      expect(lines.some((l) => l.toLowerCase().includes('paywall') && !l.includes('onboarding_paywall'))).to.equal(false)
    })

    it('uses the server total for "+ N more" - the list holds only the first page', () => {
      const lines = renderSnapshotLines(
        snapshot({
          products: [
            {access_level_id: 'x', id: 'a', period: 'monthly', title: 'Monthly', vendor_products: {}},
            {access_level_id: 'x', id: 'b', period: 'annual', title: 'Annual', vendor_products: {}},
            {access_level_id: 'x', id: 'c', period: 'lifetime', title: 'Lifetime', vendor_products: {}},
            {access_level_id: 'x', id: 'd', period: 'weekly', title: 'Weekly', vendor_products: {}},
          ],
          totals: {accessLevels: 0, paywalls: 0, placements: 0, products: 150},
        }),
      )
      expect(lines.some((l) => l.includes('Monthly, Annual, Lifetime + 147 more'))).to.equal(true)
    })
  })

  describe('dashboard mode decision', () => {
    const nonEmpty = snapshot({placements: [{developer_id: 'main', id: '1', title: 'Main'}]})

    it('an explicit flag wins in both directions, whatever the snapshot says', () => {
      expect(decideDashboardMode({codeOnlyFlag: true, interactive: true, snapshot: snapshot()})).to.equal('code-only')
      expect(decideDashboardMode({codeOnlyFlag: false, interactive: false, snapshot: nonEmpty})).to.equal('create')
    })

    it("an empty app is today's path - create, no question asked", () => {
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: true, snapshot: snapshot()})).to.equal('create')
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: false, snapshot: snapshot()})).to.equal('create')
    })

    it('a populated app asks interactively and refuses headless', () => {
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: true, snapshot: nonEmpty})).to.equal('ask')
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: false, snapshot: nonEmpty})).to.equal(
        'headless-needs-flag',
      )
    })

    it('a failed fetch is never fatal: ask interactively, create headless', () => {
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: true, snapshot: null})).to.equal('ask')
      expect(decideDashboardMode({codeOnlyFlag: undefined, interactive: false, snapshot: null})).to.equal('create')
    })
  })

  describe('placement developer ID resolution', () => {
    const logs: string[] = []
    const command = {log: (msg: string) => logs.push(msg)} as unknown as Parameters<
      typeof resolvePlacementDeveloperId
    >[0]

    function wizardSetup(overrides: Record<string, unknown> = {}) {
      return {
        appId: TEST_APP_ID,
        copyOnly: false,
        dashboardMode: 'code-only',
        driver: null,
        installSkill: false,
        interactive: false, // headless in tests: prompts must never fire
        placements: [],
        playbook: Promise.resolve({ok: true as const, reference: 'X'}),
        project: {name: 'demo', path: '/apps/demo', platform: 'flutter' as const, platformLabel: 'Flutter'},
        sdkKey: 'pk',
        token: 't',
        ...overrides,
      } as Parameters<typeof resolvePlacementDeveloperId>[1]
    }

    it('is skipped entirely outside code-only mode and for observer runs', async () => {
      expect(await resolvePlacementDeveloperId(command, wizardSetup({dashboardMode: 'create'}), 'custom')).to.equal(undefined)
      expect(await resolvePlacementDeveloperId(command, wizardSetup(), 'observer')).to.equal(undefined)
    })

    it('a single placement with a custom paywall is used without asking', async () => {
      const one = wizardSetup({placements: [{developer_id: 'main_paywall', id: '1', title: 'Main'}]})
      expect(await resolvePlacementDeveloperId(command, one, 'custom')).to.equal('main_paywall')
    })

    it('headless never prompts: ambiguous cases resolve to undefined', async () => {
      const many = wizardSetup({
        placements: [
          {developer_id: 'a', id: '1', title: 'A'},
          {developer_id: 'b', id: '2', title: 'B'},
        ],
      })
      expect(await resolvePlacementDeveloperId(command, many, 'custom')).to.equal(undefined)
      expect(await resolvePlacementDeveloperId(command, wizardSetup(), 'custom')).to.equal(undefined)
      expect(await resolvePlacementDeveloperId(command, many, 'flow_builder')).to.equal(undefined)
    })
  })
})
