import { Flags } from '@oclif/core';

import { validateCreateMigration } from '../../../../sdk/adapty/migrations/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { renderEnvelope } from '../../../views/envelope.js';

import type { CreateMigrationInput, Envelope } from '../../../../sdk/adapty/index.js';

export default class Create extends AdaptyCommand {
    static override description = 'Start a migration from RevenueCat';

    static override examples = [
        '<%= config.bin %> migrations create --name "Acme Fitness"',
        '<%= config.bin %> migrations create --flow transactions --app 3f2ab1c4-0000-4000-8000-000000000000',
    ];

    // One endpoint, two shapes: --name starts the main flow and names the Adapty app it will
    // create along the way; --flow starts an optional flow for an app main has already created.
    // The pairing is input shape, so it is declared here; the rule behind it — exactly one of the
    // two — lives in sdk/adapty/migrations/create.ts, where an MCP server obeys it too.
    static override flags = {
        name: Flags.string({
            description: 'Name of the Adapty app to create (starts the main flow: RevenueCat catalog)',
            exclusive: ['app', 'flow'],
        }),
        flow: Flags.string({
            dependsOn: ['app'],
            description: 'Optional flow to start for an existing app, e.g. transactions (see `adapty migrations list`)',
        }),
        app: Flags.string({
            dependsOn: ['flow'],
            description: 'App ID (UUID) the optional flow runs for',
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

        this.log('Migration created.');
        this.render(envelope, renderEnvelope);
        this.log(`\nContinue with \`${this.config.bin} migrations status -m ${envelope.migration.id}\`.`);

        return envelope;
    }
}
