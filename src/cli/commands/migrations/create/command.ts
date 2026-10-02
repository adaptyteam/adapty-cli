import { Flags } from '@oclif/core';

import { validateCreateMigration } from '../../../../sdk/adapty/migrations/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { MigrationCommand } from '../../../base/adapty/index.js';
import { renderEnvelope } from '../../../views/migrations/envelope/envelope.js';
import { envOverridesSelection } from '../../../views/migrations/notices.js';

import type { CreateMigrationInput, Envelope } from '../../../../sdk/adapty/index.js';

export default class Create extends MigrationCommand {
    static override summary = 'Start a migration into Adapty';
    static override description = [
        'Use --name to migrate a catalog into a new Adapty app.',
        'For an existing app, use --flow and --app together. Choose a flow and its app from `adapty migrations list`.',
        '',
        'Creation starts the flow and saves it as current; use `adapty migrations status` to continue.',
        'Use --no-select to keep the previous selection. ADAPTY_MIGRATION overrides saved selection.',
        'With --json, the migration ID is in migration.id.',
    ].join('\n');

    static override usage = [
        'migrations create --name APP_NAME [--no-select] [--json]',
        'migrations create --flow FLOW --app APP_ID [--no-select] [--json]',
    ];

    static override examples = [
        {
            description: 'Start a catalog migration into a new app:',
            command: '<%= config.bin %> migrations create --name "Acme Fitness"',
        },
        {
            description: 'Start transactions for an existing app, if listed as available:',
            command: '<%= config.bin %> migrations create --flow transactions --app 3f2ab1c4-0000-4000-8000-000000000000',
        },
        {
            description: 'Return the new migration as JSON for an agent or script:',
            command: '<%= config.bin %> migrations create --name "Acme Fitness" --json',
        },
    ];

    static override flags = {
        'no-select': Flags.boolean({
            description: 'Create without changing the saved migration selection',
            default: false,
        }),
        'name': Flags.string({
            description: 'New Adapty app name; cannot be combined with --flow or --app',
            exclusive: ['app', 'flow'],
            helpValue: 'APP_NAME',
        }),
        'flow': Flags.string({
            dependsOn: ['app'],
            description: 'Available flow from `adapty migrations list`; requires --app',
            helpValue: 'FLOW',
        }),
        'app': Flags.string({
            dependsOn: ['flow'],
            description: 'Existing Adapty app ID (UUID); requires --flow',
            helpValue: 'APP_ID',
        }),
    };

    async run(): Promise<Envelope> {
        const { flags } = await this.parse(Create);

        const input: CreateMigrationInput = {
            appId: flags.app,
            appName: flags.name,
            flow: flags.flow,
        };

        assertValid(validateCreateMigration(input));

        const envelope = await this.adapty.migrations.create(input);

        const selected = !flags['no-select'] && await this.select(envelope.migration.id);
        const target = selected && !this.currentMigration.overridden ? '' : ` -m ${envelope.migration.id}`;

        this.log('Migration created.');
        this.render(envelope, renderEnvelope);
        this.log(`\nContinue with \`${this.config.bin} migrations status${target}\`.`);

        return envelope;
    }

    /** Creation has already succeeded: a local failure must not invite a duplicate POST. */
    private async select(migrationId: string): Promise<boolean> {
        try {
            await this.currentMigration.set(migrationId);
        } catch {
            process.stderr.write(
                `Warning: Migration ${migrationId} was created, but its selection could not be saved. Continue with \`${this.config.bin} migrations status -m ${migrationId}\`.\n`,
            );

            return false;
        }

        if (this.currentMigration.overridden) {
            process.stderr.write(envOverridesSelection);
        }

        return true;
    }
}
