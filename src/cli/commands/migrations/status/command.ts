import { MigrationCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../input/migration.js';
import { renderEnvelope } from '../../../views/migrations/envelope/envelope.js';

import { waitFlags } from './lib/flags.js';
import { pollNotice } from './lib/notice.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Status extends MigrationCommand {
    static override summary = 'Show migration state, issues, and available actions';
    static override description = [
        'Read next_actions for the next steps and available_actions for optional actions.',
        'Use --json to read each action\'s input_schema, reads, and confirmation text.',
        '',
        '--wait returns when the revision changes, the state leaves running, or the polling budget runs out.',
        'Exit 0 means the request succeeded, even if the migration is still running or has failed.',
        'Check migration.state in JSON output. Progress goes to stderr. Ctrl+C exits with code 130.',
    ].join('\n');

    static override examples = [
        {
            description: 'Inspect the saved migration:',
            command: '<%= config.bin %> migrations status',
        },
        {
            description: 'See the current state and what to do next:',
            command: '<%= config.bin %> migrations status -m mig_7x2',
        },
        {
            description: 'Read action IDs, input schemas, and confirmation text as JSON:',
            command: '<%= config.bin %> migrations status -m mig_7x2 --json',
        },
        {
            description: 'Wait for a change with a five-minute polling budget:',
            command: '<%= config.bin %> migrations status -m mig_7x2 --wait --timeout 5m --json',
        },
    ];

    static override flags = { ...migrationFlags, ...waitFlags };

    async run(): Promise<Envelope> {
        const { flags } = await this.parse(Status);

        const selection = await this.currentMigration.require(flags.migration);

        const envelope = flags.wait
            ? await this.waitForMigration(selection.currentMigrationId, flags.timeout)
            : await this.adapty.migrations.get(selection.currentMigrationId);

        this.render(envelope, renderEnvelope);

        return envelope;
    }

    /** Timeout returns the last response with exit 0; Ctrl+C cancels with exit 130. */
    private async waitForMigration(id: string, timeoutMs: number | undefined): Promise<Envelope> {
        return this.adapty.migrations.waitFor(id, {
            onPoll: (envelope, delayMs) => {
                process.stderr.write(`${pollNotice(envelope, delayMs)}\n`);
            },
            signal: this.signal,
            timeoutMs,
        });
    }
}
