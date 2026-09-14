import open from 'open';

import { onAppHost } from '../../../lib/app-url.js';
import { runDeviceFlow } from '../../../sdk/core/auth/device-flow.js';
import { systemClock } from '../../../sdk/core/clock.js';
import { build, openSession } from '../../base/adapty/index.js';
import { BaseCommand } from '../../base/base-command.js';
import { exitCode } from '../../errors.js';

export default class AuthLogin extends BaseCommand {
    static override description = 'Authenticate with Adapty via browser';
    /** The one command that opts out: an interactive flow has no result to serialize. */
    static override enableJsonFlag = false;
    static override examples = ['<%= config.bin %> auth login'];

    async run(): Promise<void> {
        await this.parse(AuthLogin);

        const session = await openSession(this.config);

        if (session.user !== undefined) {
            this.log(`Already authenticated as ${session.user.email}. Re-authenticating...`);
        }

        // No token yet: the same factory without one, which leaves only auth reachable
        const adapty = build({ ...session, token: undefined }, {
            config: this.config,
            signal: this.signal,
            warn: message => this.warn(message),
        });

        const issued = await runDeviceFlow(adapty.auth, {
            clock: systemClock,

            onCode: (code) => {
                // The fallback comes before the host rewrite, so the printed link and the browser
                // always agree
                const link = this.dashboardLink(code.verificationUriComplete ?? code.verificationUri);

                this.log(`\nYour code: ${code.userCode}\n`);
                this.log(`If the browser doesn't open, visit: ${link}\n`);
                this.openBrowser(link);
                this.log('Waiting for authorization... (Ctrl+C to cancel)');
            },

            onTransientError: (error, consecutive) => {
                // One failed poll is normal and stays quiet; three in a row is worth saying,
                // because the screen otherwise looks stuck
                if (consecutive >= 3) {
                    const reason = error instanceof Error ? error.message : String(error);

                    this.warn(`${consecutive} consecutive errors while polling: ${reason}`);
                }
            },

            signal: this.signal,
        });

        await session.store.save({ token: issued.accessToken, user: issued.user });

        this.log(`\nAuthenticated as ${issued.user.email}`);
        this.log(`Session saved to ${session.store.path}`);
    }

    /** ADAPTY_APP_URL is the CLI's business: the sdk knows nothing about browsers or dashboards. */
    private dashboardLink(issuedUrl: string): string {
        try {
            return onAppHost(issuedUrl);
        } catch (error) {
            // A malformed ADAPTY_APP_URL is bad input, not a failed login
            this.error(error instanceof Error ? error.message : String(error), { exit: exitCode.usage });
        }
    }

    private openBrowser(url: string): void {
        if (!process.stdin.isTTY) {
            return;
        }

        // onCode is synchronous, so the launch is fired and forgotten: the link is already on
        // screen, and a browser that refuses to start must not fail the login
        void open(url).catch(() => undefined);
    }
}
