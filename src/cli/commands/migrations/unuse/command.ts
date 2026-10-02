import { BaseCommand } from '../../../base/base-command.js';
import { openCurrentMigration } from '../../../context/migration/index.js';
import { envSuppliesMigration } from '../../../views/migrations/notices.js';

type Result = { currentMigrationId: null };

export default class Unuse extends BaseCommand {
    static override summary = 'Clear the saved migration selection (no network)';
    static override description = [
        'Works without authentication, including when the saved context is malformed.',
        'ADAPTY_MIGRATION remains active until you unset it in your shell.',
    ].join('\n');

    static override examples = ['<%= config.bin %> migrations unuse'];

    async run(): Promise<Result> {
        await this.parse(Unuse);

        // No session: removing a record does not depend on whose it is, or on being logged in.
        const current = openCurrentMigration({ configDir: this.config.configDir });

        await current.clear();

        if (current.overridden) {
            process.stderr.write(envSuppliesMigration);
        }

        const result: Result = { currentMigrationId: null };
        this.render(result, () => 'Saved migration selection cleared.');

        return result;
    }
}
