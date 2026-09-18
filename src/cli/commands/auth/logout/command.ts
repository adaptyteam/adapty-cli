import { createFileSessionStore } from '../../../../sdk/core/session.js';
import { BaseCommand } from '../../../base/base-command.js';
import { openCurrentMigration } from '../../../context/migration/index.js';
import { envSuppliesMigration } from '../../../views/migrations/notices.js';

import { clearLocalSession } from './lib/cleanup.js';

type Result = {
    /** The env var outlives the file, so "Logged out" alone would be a lie. */
    env_token_set: boolean;
    status: 'logged_out' | 'not_authenticated';
};

/** A record rather than an if: a new status cannot be added without a text for it. */
const messages: Record<Result['status'], string> = {
    logged_out: 'Logged out. Note: the token stays valid server-side until it expires — see `adapty auth revoke`.',
    not_authenticated: 'Not currently authenticated.',
};

const ENV_STILL_SET
    = 'ADAPTY_TOKEN is still set in the environment, so commands stay authenticated. Unset it to finish logging out.';

export default class AuthLogout extends BaseCommand {
    static override description = 'Remove stored credentials and the saved migration selection';
    static override examples = ['<%= config.bin %> auth logout'];

    async run(): Promise<Result> {
        await this.parse(AuthLogout);

        const envTokenSet = process.env.ADAPTY_TOKEN !== undefined && process.env.ADAPTY_TOKEN !== '';

        // No session: an orphaned selection has to go even when the credentials cannot be read.
        const current = openCurrentMigration({ configDir: this.config.configDir });

        if (current.overridden) {
            process.stderr.write(envSuppliesMigration);
        }

        const hadSession = await clearLocalSession(createFileSessionStore(this.config.configDir), current);

        const result: Result = {
            env_token_set: envTokenSet,
            status: hadSession ? 'logged_out' : 'not_authenticated',
        };

        this.render(result, status => (status.env_token_set
            ? `${messages[status.status]}\n${ENV_STILL_SET}`
            : messages[status.status]));

        return result;
    }
}
