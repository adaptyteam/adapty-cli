import { Args, Flags } from '@oclif/core';

import { MigrationCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { migrationFlags } from '../../../input/migration.js';
import { renderEnvelope } from '../../../views/migrations/envelope/envelope.js';

import { actionView } from './lib/action-view.js';
import { findAction, unknownActionMessage, unsupportedActionMessage } from './lib/actions.js';
import { readActionInput } from './lib/input.js';
import { openLink } from './lib/open-link.js';

import type { Action, Envelope } from '../../../../sdk/adapty/index.js';
import type { MigrationSelection } from '../../../context/migration/index.js';

type RunContext = {
    action: Action;
    envelope: Envelope;
    flags: {
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
    static override summary = 'Run an input action or open an external action link';
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
    };

    async run(): Promise<Envelope> {
        const context = await this.prepare();

        if (context.href !== undefined) {
            return this.runExternalAction(context, context.href);
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
