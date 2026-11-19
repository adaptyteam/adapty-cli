import { openSession, savedRegion } from '../../../base/adapty/index.js';
import { BaseCommand } from '../../../base/base-command.js';

import { renderStatus } from './lib/render.js';

import type { Result } from './lib/result.js';

export default class AuthStatus extends BaseCommand {
    static override description = 'Show the local authentication state (no network)';
    static override examples = ['<%= config.bin %> auth status'];

    async run(): Promise<Result> {
        await this.parse(AuthStatus);

        const session = await openSession(this.config);
        // The saved session is described as it is, whatever region this run itself goes to
        const saved = session.token === undefined ? undefined : await savedRegion(session);

        const result: Result = session.token === undefined
            ? { authenticated: false, config_path: session.store.path, source: 'none' }
            : {
                    authenticated: true,
                    config_path: session.store.path,
                    email: session.user?.email,
                    name: session.user?.name,
                    // Only an EU session says so: a US one prints what it always has
                    ...(saved === 'eu' ? { region: 'eu' as const } : {}),
                    source: session.source === 'env' ? 'env' : 'file',
                    token_prefix: session.token.slice(0, 8),
                };

        this.render(result, renderStatus);

        return result;
    }
}
