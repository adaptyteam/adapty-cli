import { openSession } from '../../base/adapty/index.js';
import { BaseCommand } from '../../base/base-command.js';

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
    static override description = 'Remove the stored session';
    static override examples = ['<%= config.bin %> auth logout'];

    async run(): Promise<Result> {
        await this.parse(AuthLogout);

        const session = await openSession(this.config);
        const stored = await session.store.load();

        if (stored !== undefined) {
            await session.store.clear();
        }

        const result: Result = {
            env_token_set: session.source === 'env',
            status: stored === undefined ? 'not_authenticated' : 'logged_out',
        };

        this.render(result, status => (status.env_token_set
            ? `${messages[status.status]}\n${ENV_STILL_SET}`
            : messages[status.status]));

        return result;
    }
}
