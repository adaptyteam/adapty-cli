import {expect} from 'chai'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {buildMigrateAction} from '../../../src/lib/agent/actions/migrate.js'
import {
  type AgentAction,
  buildActionPrompt,
  buildCopyPrompt,
  type PromptContext,
  resolveCliCommand,
} from '../../../src/lib/agent/prompt.js'
import {preparePromptContext} from '../../../src/lib/agent/wizard.js'
import {useTmpDir} from '../../helpers/tmp-dir.js'

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
    const dir = useTmpDir('adapty-skill-')

    it('preparePromptContext never carries the wizard token into the prompt', async () => {
      // Real seam: the token lives on WizardSetup; the contract is that no
      // PromptContext field (and therefore no prompt text) derives from it.
      const secret = 'secret-session-token-xyz'
      await mkdir(join(dir(), 'references'), {recursive: true})
      await writeFile(join(dir(), 'references', 'flutter.md'), '# playbook')
      process.env.ADAPTY_SKILL_DIR = dir()
      try {
        const promptCtx = await preparePromptContext(
          {
            appId: 'app-1',
            driver: null,
            interactive: false,
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
      } finally {
        delete process.env.ADAPTY_SKILL_DIR
      }
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
      process.argv[1] = '/checkout/bin/dev.js'
      expect(resolveCliCommand()).to.equal('node "/checkout/bin/run.js"')
    })

    it('uses the entry script as-is otherwise', () => {
      process.argv[1] = '/checkout/bin/run.js'
      expect(resolveCliCommand()).to.equal('node "/checkout/bin/run.js"')
    })
  })

  describe('migrate action', () => {
    it('names the source and carries the mapping rules and the playbook', () => {
      const prompt = buildActionPrompt(buildMigrateAction('the in_app_purchase plugin'), ctx())
      expect(prompt).to.include('from the in_app_purchase plugin to Adapty')
      expect(prompt).to.include('every call site of the in_app_purchase plugin')
      expect(prompt).to.include('<mapping_rules>')
      expect(prompt).to.include('create NOTHING for it')
      expect(prompt).to.include('PLAYBOOK CONTENT')
    })

    it('embeds the RC catalog as ground truth when provided', () => {
      const prompt = buildActionPrompt(buildMigrateAction('RevenueCat', 'CATALOG SNAPSHOT'), ctx())
      expect(prompt).to.include('<revenuecat_catalog')
      expect(prompt).to.include('CATALOG SNAPSHOT')
      expect(prompt).to.not.include('Verify against your RevenueCat dashboard')
    })

    it('demands a verify-against-dashboard section when run without the catalog', () => {
      const prompt = buildActionPrompt(buildMigrateAction('RevenueCat'), ctx())
      expect(prompt).to.include('Verify against your RevenueCat dashboard')
      expect(prompt).to.include('--rc-key')
    })
  })
})
