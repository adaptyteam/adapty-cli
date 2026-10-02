import { Flags } from '@oclif/core';

import { MigrationCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../input/migration.js';
import { renderEnvelope } from '../../../views/migrations/envelope/envelope.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Close extends MigrationCommand {
    static override summary = 'Permanently finish or cancel a migration';
    static override description = [
        'Choose finish to mark the migration as completed, or cancel to abandon it.',
        'Both outcomes permanently close the migration and require --yes. No confirmation prompt is shown.',
        '',
        'With --json, returns the full migration response after closing.',
    ].join('\n');

    static override examples = [
        {
            description: 'Finish the saved migration:',
            command: '<%= config.bin %> migrations close --outcome finish --yes',
        },
        {
            description: 'Mark the migration as finished:',
            command: '<%= config.bin %> migrations close -m mig_7x2 --outcome finish --yes',
        },
        {
            description: 'Abandon the migration:',
            command: '<%= config.bin %> migrations close -m mig_7x2 --outcome cancel --yes',
        },
        {
            description: 'Finish and return the final state as JSON:',
            command: '<%= config.bin %> migrations close -m mig_7x2 --outcome finish --yes --json',
        },
    ];

    static override flags = {
        ...migrationFlags,
        outcome: Flags.option({
            description: 'finish: mark completed; cancel: abandon the migration',
            options: ['finish', 'cancel'] as const,
            required: true,
        })(),
        yes: Flags.boolean({
            char: 'y',
            description: 'Confirm permanent closure of this migration',
            required: true,
        }),
    };

    async run(): Promise<Envelope> {
        const { flags } = await this.parse(Close);

        const selection = await this.currentMigration.require(flags.migration);
        const { migration } = await this.adapty.migrations.get(selection.currentMigrationId);

        if (selection.source === 'context') {
            process.stderr.write(`Using saved migration: ${selection.currentMigrationId}\n`);
        }

        const envelope = await this.adapty.migrations.close(selection.currentMigrationId, {
            expectedRevision: migration.revision,
            outcome: flags.outcome,
        });

        this.render(envelope, renderEnvelope);

        return envelope;
    }
}
