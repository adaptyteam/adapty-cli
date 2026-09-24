import { MigrationCommand } from '../../../base/adapty/index.js';
import { migrationArgs } from '../../../input/migration.js';
import { envOverridesSelection } from '../../../views/migrations/notices.js';

type Result = { currentMigrationId: string };

export default class Use extends MigrationCommand {
    static override summary = 'Save the current migration after verifying access';
    static override description = [
        'Select a migration for the current token. This does not start or modify the migration.',
        'Completed, canceled and failed migrations can also be selected for inspection.',
        'ADAPTY_MIGRATION overrides the saved selection until you unset it in your shell.',
    ].join('\n');

    static override examples = ['<%= config.bin %> migrations use mig_7x2'];
    static override args = { ...migrationArgs };

    async run(): Promise<Result> {
        const { args } = await this.parse(Use);
        const { migration } = await this.adapty.migrations.get(args.id);

        await this.currentMigration.set(migration.id);

        if (this.currentMigration.overridden) {
            process.stderr.write(envOverridesSelection);
        }

        const result = { currentMigrationId: migration.id };
        this.render(result, value => `Current migration: ${value.currentMigrationId}`);

        return result;
    }
}
