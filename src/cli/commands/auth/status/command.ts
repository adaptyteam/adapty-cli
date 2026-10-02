import { openSession } from '../../../base/adapty/index.js';
import { BaseCommand } from '../../../base/base-command.js';

import { renderStatus } from './lib/render.js';

import type { Result } from './lib/result.js';

export default class AuthStatus extends BaseCommand {
    static override description = 'Show the local authentication state (no network)';
    static override examples = ['<%= config.bin %> auth status'];

    async run(): Promise<Result> {
        await this.parse(AuthStatus);

        const session = await openSession(this.config);

        const result: Result = session.token === undefined
            ? { authenticated: false, config_path: session.store.path, source: 'none' }
            : {
                    authenticated: true,
                    config_path: session.store.path,
                    email: session.user?.email,
                    source: session.source === 'env' ? 'env' : 'file',
                    token_prefix: session.token.slice(0, 8),
                };

        this.render(result, renderStatus);

        return result;
    }
}
