import { expect } from 'chai';

import { renderStatus } from '../../../../../src/cli/commands/auth/status/lib/render.js';

const CONFIG_PATH = '/home/dev/.config/adapty/config.json';

/**
 * The view is now reachable on its own, so its four branches are asserted byte for byte instead of
 * through a command run. `test/commands/auth/status.test.ts` still covers what the command puts in.
 */
describe('renderStatus', () => {
    it('says how to log in when there is no token', () => {
        expect(renderStatus({ authenticated: false, config_path: CONFIG_PATH, source: 'none' }))
            .to.equal('Not authenticated. Run `adapty auth login`.');
    });

    it('names the environment as the source instead of a file it never read', () => {
        expect(renderStatus({
            authenticated: true,
            config_path: CONFIG_PATH,
            email: undefined,
            name: undefined,
            source: 'env',
            token_prefix: 'env-toke',
        })).to.equal('Token: env-toke****\nSource: ADAPTY_TOKEN (environment)');
    });

    it('prints the user, the masked token and the file it came from', () => {
        expect(renderStatus({
            authenticated: true,
            config_path: CONFIG_PATH,
            email: undefined,
            name: 'Dev',
            source: 'file',
            token_prefix: 'stored-t',
        })).to.equal(`User: Dev\nToken: stored-t****\nConfig: ${CONFIG_PATH}`);
    });

    it('adds the email a session saved before the server stopped sending it', () => {
        expect(renderStatus({
            authenticated: true,
            config_path: CONFIG_PATH,
            email: 'dev@example.com',
            name: 'Dev',
            source: 'file',
            token_prefix: 'stored-t',
        })).to.equal(`User: Dev\nEmail: dev@example.com\nToken: stored-t****\nConfig: ${CONFIG_PATH}`);
    });

    it('drops the user line when the stored session carries no user', () => {
        expect(renderStatus({
            authenticated: true,
            config_path: CONFIG_PATH,
            email: undefined,
            name: undefined,
            source: 'file',
            token_prefix: 'stored-t',
        })).to.equal(`Token: stored-t****\nConfig: ${CONFIG_PATH}`);
    });
});
