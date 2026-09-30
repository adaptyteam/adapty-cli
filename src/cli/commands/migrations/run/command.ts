import { mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join, relative } from 'node:path';

import { Args, Flags } from '@oclif/core';

import { agents, choose, extractSummary, headlessAgentIds, install, onPath, runHeadless, runQuietly } from '../../../agents/index.js';
import { MigrationCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { migrationFlags } from '../../../input/migration.js';
import { renderEnvelope } from '../../../views/migrations/envelope/envelope.js';

import { actionView } from './lib/action-view.js';
import { findAction, unknownActionMessage, unsupportedActionMessage } from './lib/actions.js';
import { BRANCH, buildPrompt, hasUncommittedChanges, repositoryRoot, switchToBranch, writeCliShim } from './lib/agent.js';
import { readActionInput } from './lib/input.js';
import { openLink } from './lib/open-link.js';

import type { Action, Envelope } from '../../../../sdk/adapty/index.js';
import type { Agent, HeadlessAgentId } from '../../../agents/index.js';
import type { MigrationSelection } from '../../../context/migration/index.js';

type RunContext = {
    action: Action;
    envelope: Envelope;
    flags: {
        'agent': HeadlessAgentId | undefined;
        'no-browser': boolean;
        'open': boolean;
        'yes': boolean;
    };
    /** Set for every action the server hands over as a link, whatever kind it calls itself. */
    href: string | undefined;
    input: unknown;
    selection: MigrationSelection;
};

export default class Run extends MigrationCommand {
    static override summary = 'Run an input action, open an external action link, or run an agent action on the app code';
    static override description = [
        'Choose an action ID from next_actions or available_actions in `adapty migrations status -m ID --json`.',
        'Replace ACTION_ID in the examples with an offered action ID.',
        'For input actions, read the resources in reads and prepare a JSON object matching input_schema.',
        'Omitting input sends {}. Review confirm before passing --yes.',
        'Without --yes, actions requiring confirmation exit with code 6. No confirmation prompt is shown.',
        '',
        'External actions print a link and open it in an interactive terminal. Complete the browser step, then check status.',
        'External actions reject --input and --input-file, including stdin.',
        'Pipes and --json require --open to launch a browser; BROWSER=none disables it.',
        'File uploads are not supported; use the dashboard or an offered Cloud Export action.',
        '',
        'Agent actions run a coding agent (Claude Code or Codex) on the app in the current git repository, on the',
        `${BRANCH} branch, with the resources in reads. The working tree must be clean.`,
        '',
        'With --json, returns the full migration response (before the browser step for external actions).',
        'After a revision_conflict error, read status and review the action before retrying.',
    ].join('\n');

    static override examples = [
        {
            description: 'Run an offered action on the saved migration after reviewing confirm:',
            command: '<%= config.bin %> migrations run ACTION_ID --yes',
        },
        {
            description: 'Read current action IDs and input schemas first:',
            command: '<%= config.bin %> migrations status -m mig_7x2 --json',
        },
        {
            description: 'Submit an empty JSON object, if the action input_schema allows it:',
            command: '<%= config.bin %> migrations run ACTION_ID -m mig_7x2 --input \'{}\'',
        },
        {
            description: 'Submit a file matching input_schema, after reviewing confirm:',
            command: '<%= config.bin %> migrations run ACTION_ID -m mig_7x2 --input-file ./decisions.json --yes --json',
        },
        {
            description: 'Read the same prepared input from stdin:',
            command: '<%= config.bin %> migrations run ACTION_ID -m mig_7x2 --input-file - --yes --json < ./decisions.json',
        },
        {
            description: 'Get an external action link without opening a browser:',
            command: '<%= config.bin %> migrations run ACTION_ID -m mig_7x2 --no-browser',
        },
    ];

    static override args = {
        action_id: Args.string({
            description: 'Offered action ID from `adapty migrations status`',
            required: true,
        }),
    };

    static override flags = {
        ...migrationFlags,
        'input': Flags.string({
            description: 'Input action data as a JSON object matching input_schema',
            exclusive: ['input-file'],
            helpValue: 'JSON',
        }),
        'input-file': Flags.string({
            description: 'Read an input action\'s JSON object from a file; use - for stdin',
            exclusive: ['input'],
            helpValue: 'PATH',
        }),
        'yes': Flags.boolean({
            char: 'y',
            default: false,
            description: 'Confirm the input action after reviewing its confirmation text',
        }),
        'open': Flags.boolean({
            default: false,
            description: 'Open an external action\'s HTTPS link, including with pipes or --json',
            exclusive: ['no-browser'],
        }),
        'no-browser': Flags.boolean({
            default: false,
            description: 'Show the external action without opening a browser',
            exclusive: ['open'],
        }),
        'agent': Flags.option({
            description: 'Coding agent for an agent action. Default: the one found on PATH',
            options: headlessAgentIds,
        })(),
    };

    async run(): Promise<Envelope> {
        const context = await this.prepare();

        if (context.href !== undefined) {
            return this.runExternalAction(context, context.href);
        }

        if (context.action.kind === 'agent') {
            return this.runAgentAction(context);
        }

        return this.runInputAction(context);
    }

    private async prepare(): Promise<RunContext> {
        const { args, flags } = await this.parse(Run);
        // Inline input and files are read before the request; stdin waits for the action kind.
        const fromStdin = flags['input-file'] === '-';
        const input = fromStdin ? undefined : await readActionInput(flags);

        const selection = await this.currentMigration.require(flags.migration);
        const envelope = await this.adapty.migrations.get(selection.currentMigrationId);
        const action = findAction(envelope, args.action_id);

        if (action === undefined) {
            throw new CliError(unknownActionMessage(envelope, args.action_id), exitCode.usage, 'action_not_found');
        }

        const href = 'href' in action ? action.href : undefined;

        if (href !== undefined && (flags.input !== undefined || flags['input-file'] !== undefined)) {
            throw new CliError(
                `Action \`${action.action_id}\` hands over a link and does not accept --input or --input-file. Remove the input option and complete the step in the browser.`,
                exitCode.usage,
                'action_input_unsupported',
            );
        }

        return {
            action, envelope, flags, href, selection,
            input: fromStdin && action.kind === 'input' ? await readActionInput(flags) : input,
        };
    }

    private async runAgentAction({ action, envelope, flags, selection }: RunContext): Promise<Envelope> {
        const root = await repositoryRoot(process.cwd());

        if (root === undefined) {
            throw new CliError(`\`${action.action_id}\` changes the app code: run it from the app's git repository.`, exitCode.usage, 'not_a_repository');
        }

        if (await hasUncommittedChanges(root)) {
            throw new CliError(
                'The repository has uncommitted changes. Commit or stash them first, so the migration stays one reviewable diff.',
                exitCode.usage,
                'repository_dirty',
            );
        }

        const migrationId = selection.currentMigrationId;
        const dir = join(root, '.git', 'adapty');
        const files: string[] = [];
        const guides: string[] = [];

        // Read first: a resource the step is not ready for (no paywall choice yet) stops the run before it costs
        // anything.
        await mkdir(dir, { recursive: true });

        for (const name of action.reads) {
            const { result } = await this.adapty.migrations.resource(migrationId, name);

            if (typeof result === 'object' && result !== null && 'markdown' in result && typeof result.markdown === 'string') {
                guides.push(result.markdown);
            } else {
                const file = join(dir, `${name}.json`);

                await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
                files.push(`\`${name}\`: ${relative(root, file)}`);
            }
        }

        const agent = await this.pickAgent(flags.agent);
        const skills = await install(agent, runQuietly);

        if (!skills.installed) {
            throw new CliError(`Could not install the Adapty skills into ${agent.name}: ${skills.error ?? 'unknown error'}`, 1, 'skills_install_failed');
        }

        await switchToBranch(root);
        const shimDir = await writeCliShim(dir);

        process.stderr.write(`Running ${agent.name} on ${root}, branch ${BRANCH}. This usually takes a few minutes.\n`);

        const run = await runHeadless({
            agent: agent.id as HeadlessAgentId,
            cwd: root,
            env: { ...process.env, PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}` },
            prompt: buildPrompt({ appId: envelope.migration.app?.id ?? '', files, guides, migrationId }),
            signal: this.signal,
        });

        const summary = extractSummary(run.finalText);

        if (summary === undefined) {
            const said = (run.finalText === '' ? run.stderr : run.finalText).trim().split('\n').slice(-5).join('\n');

            throw new CliError(`${agent.name} ended without a summary, so the step is not marked done. It last said:\n${said}`, 1, 'agent_no_summary');
        }

        const latest = await this.adapty.migrations.get(migrationId);

        const result = await this.adapty.migrations.runAction(migrationId, action.action_id, {
            expectedRevision: latest.migration.revision,
            input: { summary },
        });

        this.render(result, renderEnvelope);

        process.stderr.write(
            `Review the changes on branch ${BRANCH} and the steps left in ADAPTY_SETUP.md, then finish with `
            + '`adapty migrations close --outcome finish --yes`.\n',
        );

        return result;
    }

    private async pickAgent(asked: HeadlessAgentId | undefined): Promise<Agent> {
        const headless = agents.filter(agent => (headlessAgentIds as readonly string[]).includes(agent.id));
        const found: Agent[] = [];

        for (const agent of headless) {
            if ((asked === undefined || agent.id === asked) && await onPath(agent.bin)) {
                found.push(agent);
            }
        }

        if (found.length === 0) {
            const names = headless.map(agent => `\`${agent.bin}\``).join(' or ');

            throw new CliError(`Found neither ${names} on PATH: install Claude Code or Codex to migrate the app code.`, exitCode.usage, 'no_agent_found');
        }

        if (found.length === 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked
            return found[0]!;
        }

        if (!this.interactive || !process.stdin.isTTY) {
            throw new CliError(`Found ${found.map(agent => agent.name).join(', ')}. Choose one with --agent.`, exitCode.usage, 'agent_choice_required');
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- choose returns at least one
        return (await choose(found, this.signal))[0]!;
    }

    private async runExternalAction(context: RunContext, href: string): Promise<Envelope> {
        this.render({ action: context.action, migrationId: context.envelope.migration.id }, actionView);
        await openLink(href, context.flags, this.interactive);

        return context.envelope;
    }

    private async runInputAction({ action, envelope, flags, input, selection }: RunContext): Promise<Envelope> {
        if (action.kind !== 'input' && action.kind !== 'upload' && action.kind !== 'external') {
            this.render({ action, migrationId: envelope.migration.id }, actionView);

            return envelope;
        }

        if (action.kind !== 'input') {
            throw new CliError(unsupportedActionMessage(action), exitCode.usage, 'action_unsupported');
        }

        if (action.confirm !== null && !flags.yes) {
            const message = `${action.confirm}\n\nRe-run with --yes to do it.`;

            throw new CliError(message, exitCode.confirmRequired, 'confirm_required');
        }

        if (selection.source === 'context') {
            process.stderr.write(`Using saved migration: ${selection.currentMigrationId}\n`);
        }

        const result = await this.adapty.migrations.runAction(selection.currentMigrationId, action.action_id, {
            expectedRevision: envelope.migration.revision,
            input,
        });

        this.render(result, renderEnvelope);

        return result;
    }
}
