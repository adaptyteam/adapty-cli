import { MigrationCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../input/migration.js';

import { renderSteps } from './lib/render.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Steps extends MigrationCommand {
    static override summary = 'Show the migration checklist and step statuses';
    static override description = [
        'Shows done, active, and locked steps in migration order.',
        'To find actions you can run, use `adapty migrations status -m ID`.',
        '',
        'With --json, the full migration response is returned; the checklist is in steps.',
    ].join('\n');

    static override examples = [
        {
            description: 'View the saved migration checklist:',
            command: '<%= config.bin %> migrations steps',
        },
        {
            description: 'View the checklist:',
            command: '<%= config.bin %> migrations steps -m mig_7x2',
        },
        {
            description: 'Extract the checklist as JSON (requires jq):',
            command: '<%= config.bin %> migrations steps -m mig_7x2 --json | jq \'.steps\'',
        },
    ];

    static override flags = { ...migrationFlags };

    async run(): Promise<Envelope> {
        const { flags } = await this.parse(Steps);

        const selection = await this.currentMigration.require(flags.migration);
        const envelope = await this.adapty.migrations.get(selection.currentMigrationId);

        this.render(envelope, renderSteps);

        return envelope;
    }
}
