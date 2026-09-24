import { openSession } from '../../../base/adapty/index.js';
import { BaseCommand } from '../../../base/base-command.js';
import { openCurrentMigration } from '../../../context/migration/index.js';

type Result = {
    currentMigrationId: string | null;
    source: 'env' | 'context' | null;
};

export default class Current extends BaseCommand {
    static override summary = 'Show the effective migration selection and its source (no network)';
    static override description = [
        'ADAPTY_MIGRATION takes precedence over the saved selection for the current token.',
        'With no applicable selection, returns null and exits successfully.',
    ].join('\n');

    static override examples = ['<%= config.bin %> migrations current', '<%= config.bin %> migrations current --json'];

    async run(): Promise<Result> {
        await this.parse(Current);

        const selection = await openCurrentMigration({
            configDir: this.config.configDir,
            session: await openSession(this.config),
        }).get();

        const result: Result = selection === undefined
            ? { currentMigrationId: null, source: null }
            : { currentMigrationId: selection.currentMigrationId, source: selection.source === 'env' ? 'env' : 'context' };

        this.render(result, value => value.currentMigrationId === null
            ? `No migration selected. Run \`${this.config.bin} migrations use <id>\`.`
            : `Current migration: ${value.currentMigrationId} (${value.source === 'env' ? 'ADAPTY_MIGRATION' : 'context'})`,
        );

        return result;
    }
}
