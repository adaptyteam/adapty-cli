import { build, openSession } from '../../../base/adapty/index.js';
import { BaseCommand } from '../../../base/base-command.js';
import { openCurrentMigration } from '../../../context/migration/index.js';

import { clearRevokedSession } from './lib/cleanup.js';

type Result
    = | { status: 'not_authenticated' }
        | { env_token_set: boolean; status: 'revoked' };

export default class AuthRevoke extends BaseCommand {
    static override description = 'Revoke the current token and remove matching stored credentials and migration selection';
    static override examples = ['<%= config.bin %> auth revoke'];

    async run(): Promise<Result> {
        await this.parse(AuthRevoke);

        const session = await openSession(this.config);

        if (session.token === undefined) {
            this.log('Not currently authenticated.');

            return { status: 'not_authenticated' };
        }

        // Server first, file second. The other order, on a failed request, leaves a live token on
        // the server and no local copy to revoke it with — only the dashboard could undo that.
        const adapty = build(session, {
            config: this.config,
            interactive: this.interactive,
            signal: this.signal,
            warn: message => this.warn(message),
        });

        await adapty.auth.revokeToken(session.token);

        // ADAPTY_TOKEN may override a different, still-valid session in the file.
        await clearRevokedSession(
            session.store,
            openCurrentMigration({ configDir: this.config.configDir, session }),
            session.token,
        );

        const result: Result = { env_token_set: session.source === 'env', status: 'revoked' };

        this.render(result, status => (status.env_token_set
            ? 'Token revoked. ADAPTY_TOKEN is still set and now holds a dead token — unset it.'
            : 'Token revoked and logged out.'));

        return result;
    }
}
