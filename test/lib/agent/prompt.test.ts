import {expect} from 'chai'
import {join} from 'node:path'

import {integrateAction} from '../../../src/lib/agent/actions/integrate.js'
import {buildMigrateAction} from '../../../src/lib/agent/actions/migrate.js'
import {
  type AgentAction,
  buildActionPrompt,
  buildCopyPrompt,
  type PromptContext,
  resolveCliCommand,
} from '../../../src/lib/agent/prompt.js'
import {preparePromptContext} from '../../../src/lib/agent/wizard.js'

const ACTION: AgentAction = {id: 'integrate', task: () => 'DO THE TASK', title: 'integration'}

function ctx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    appId: '550e8400-e29b-41d4-a716-446655440000',
    cliCommand: 'node "/x/bin/run.js"',
    paywallApproach: 'flow_builder',
    platformReference: 'PLAYBOOK CONTENT',
    project: {name: 'demo', path: '/apps/demo', platform: 'flutter', platformLabel: 'Flutter'},
    sdkKey: 'public_live_abc123',
    ...overrides,
  }
}

describe('agent prompts', () => {
  describe('headless mode (default)', () => {
    const prompt = buildActionPrompt(ACTION, ctx())

    it('carries the HEADLESS rule and the [STATUS] protocol', () => {
      expect(prompt).to.include('This is a HEADLESS run')
      expect(prompt).to.include('[STATUS] ')
      expect(prompt).to.include("'[STATUS] Done'")
    })

    it('embeds context and the immutable-store-ID rule', () => {
      expect(prompt).to.include('<platform>Flutter</platform>')
      expect(prompt).to.include('<app_directory>/apps/demo</app_directory>')
      expect(prompt).to.include('public_live_abc123')
      expect(prompt).to.include('Store product IDs are IMMUTABLE')
      expect(prompt).to.include('create NO products - and no paywall or placement either')
    })

    it('links docs only where a guide genuinely helps, never on every item', () => {
      expect(prompt).to.include('Do not force a link onto every item')
    })
  })

  describe('copy mode', () => {
    const prompt = buildCopyPrompt(ACTION, ctx())

    it('drops the [STATUS] protocol entirely', () => {
      expect(prompt).to.not.include('[STATUS]')
    })

    it('swaps the HEADLESS rule for the ask-the-user rule', () => {
      expect(prompt).to.not.include('HEADLESS')
      expect(prompt).to.not.include('Never ask questions')
      expect(prompt).to.include('When a decision genuinely needs the user')
    })

    it('keeps the task and the checklist conventions', () => {
      expect(prompt).to.include('DO THE TASK')
      expect(prompt).to.include('ADAPTY_SETUP.md')
    })
  })

  describe('session-token isolation', () => {
    it('preparePromptContext never carries the wizard token into the prompt', async () => {
      // Real seam: the token lives on WizardSetup; the contract is that no
      // PromptContext field (and therefore no prompt text) derives from it.
      const secret = 'secret-session-token-xyz'
      const promptCtx = await preparePromptContext(
        {
          appId: 'app-1',
          copyOnly: true,
          driver: null,
          installSkill: false,
          interactive: false,
          playbook: Promise.resolve({ok: true as const, reference: '# playbook'}),
          project: {name: 'demo', path: '/apps/demo', platform: 'flutter', platformLabel: 'Flutter'},
          sdkKey: 'public_live_abc123',
          token: secret,
        },
        'flow_builder',
      )
      expect(JSON.stringify(promptCtx)).to.not.include(secret)
      const prompt = buildCopyPrompt(ACTION, promptCtx)
      expect(prompt).to.not.include(secret)
      expect(prompt).to.include('public_live_abc123')
    })
  })

  it('marks a missing SDK key as such instead of leaving a blank', () => {
    const prompt = buildCopyPrompt(ACTION, ctx({sdkKey: ''}))
    expect(prompt).to.include('(not provided - ask the user')
  })

  describe('resolveCliCommand', () => {
    const originalArgv1 = process.argv[1]

    afterEach(() => {
      process.argv[1] = originalArgv1
    })

    it('redirects bin/dev.js to its run.js sibling (dev.js needs its shebang loader)', () => {
      // Build paths with node:path so the expectation matches the platform's separators (CI runs on Windows too).
      process.argv[1] = join('checkout', 'bin', 'dev.js')
      expect(resolveCliCommand()).to.equal(`node "${join('checkout', 'bin', 'run.js')}"`)
    })

    it('uses the entry script as-is otherwise', () => {
      process.argv[1] = join('checkout', 'bin', 'run.js')
      expect(resolveCliCommand()).to.equal(`node "${join('checkout', 'bin', 'run.js')}"`)
    })
  })

  describe('integrate action', () => {
    // Asserted on the task body, not the whole prompt: the shared rules block
    // legitimately names the products -> paywalls -> placements sequence.
    it('creates nothing on the Flow Builder path - a paywall placement would burn the flow ID', () => {
      const task = integrateAction.task(ctx({paywallApproach: 'flow_builder'}))
      // The command names still appear - as the things NOT to run. What must
      // never appear is a runnable invocation of either.
      expect(task).to.not.include('placements create --app')
      expect(task).to.not.include('paywalls create --app')
      expect(task).to.include('Create NOTHING here, not even the placement')
      expect(task).to.include('FLOW placement')
    })

    it('still creates paywall and placement when the user builds the paywall themselves', () => {
      const task = integrateAction.task(ctx({paywallApproach: 'custom'}))
      expect(task).to.include('paywalls create --app')
      expect(task).to.include('placements create --app')
    })
  })

  describe('migrate action', () => {
    it('names the source and carries both playbooks', () => {
      const prompt = buildActionPrompt(
        buildMigrateAction('the in_app_purchase plugin'),
        ctx({migrationReference: 'MIGRATION RULES'}),
      )
      expect(prompt).to.include('from the in_app_purchase plugin to Adapty')
      expect(prompt).to.include('every call site of the in_app_purchase plugin')
      expect(prompt).to.include('MIGRATION PLAYBOOK')
      expect(prompt).to.include('MIGRATION RULES')
      expect(prompt).to.include('PLAYBOOK CONTENT')
    })

    // The rules live in the skill's references/migration.md. Inlining them here
    // again would reintroduce the drift this indirection exists to prevent.
    it('does not inline the mapping rules it used to carry', () => {
      const prompt = buildActionPrompt(buildMigrateAction('RevenueCat'), ctx({migrationReference: 'MIGRATION RULES'}))
      expect(prompt).to.not.include('<mapping_rules>')
      expect(prompt).to.not.include('create NOTHING for it')
    })

    it('tells the agent to map conservatively when the migration playbook is unavailable', () => {
      const prompt = buildActionPrompt(buildMigrateAction('Qonversion'), ctx())
      expect(prompt).to.include('not available')
      expect(prompt).to.include('create nothing you cannot verify')
    })

    it('embeds the RC catalog as ground truth when provided', () => {
      const prompt = buildActionPrompt(buildMigrateAction('RevenueCat', 'CATALOG SNAPSHOT'), ctx())
      expect(prompt).to.include('<revenuecat_catalog')
      expect(prompt).to.include('CATALOG SNAPSHOT')
      expect(prompt).to.not.include("verify against your source's dashboard")
      expect(prompt).to.not.include('--rc-key')
    })

    it('demands the verify-against-dashboard checklist when run without the catalog', () => {
      const prompt = buildActionPrompt(buildMigrateAction('RevenueCat'), ctx({migrationReference: 'MIGRATION RULES'}))
      expect(prompt).to.include("verify against your source's dashboard")
      expect(prompt).to.include('--rc-key')
    })

    // --rc-key is a RevenueCat-only automation; offering it for another source
    // would send the user looking for a flag that cannot help them.
    it('does not offer --rc-key for a non-RevenueCat source', () => {
      const prompt = buildActionPrompt(buildMigrateAction('Superwall'), ctx({migrationReference: 'MIGRATION RULES'}))
      expect(prompt).to.include("verify against your source's dashboard")
      expect(prompt).to.not.include('--rc-key')
    })
  })
})
