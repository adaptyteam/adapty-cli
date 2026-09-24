import { AuthRequiredError } from '../../../sdk/core/errors.js';
import { BaseCommand } from '../base-command.js';

import { build } from './build.js';
import { openSession } from './openSession.js';

import type { Attribution } from '../../../sdk/attribution/index.js';
import type { AuthenticatedSession, ResolvedSession } from '../adapty/index.js';

/**
 * Commands of the attribution backend, which all require a token. The same shape as AdaptyCommand:
 * the session is resolved in init(), the token is demanded and the sdk built only on first access,
 * so a command that validates its input first answers bad input with exit 2, not "Not authenticated".
 */
export abstract class AttributionCommand extends BaseCommand {
    // Keep one own static so oclif's manifest cache walks through this intermediate class and
    // includes statics inherited from BaseCommand.
    static override enableJsonFlag = true;

    #attribution: Attribution | undefined;
    #resolved: ResolvedSession | undefined;

    protected get attribution(): Attribution {
        this.#attribution ??= build(this.session, {
            config: this.config,
            signal: this.signal,
            warn: message => this.warn(message),
        });

        return this.#attribution;
    }

    /** Narrowed once here, so nothing downstream re-checks the token. */
    protected get session(): AuthenticatedSession {
        const resolved = this.#resolved;

        if (resolved === undefined) {
            // A bug, not a user error, and deliberately not an SdkError: it lands as exit 1 with a
            // stack instead of passing for a normal scenario.
            throw new Error('session is available only after init()');
        }

        if (resolved.token === undefined) {
            throw new AuthRequiredError('missing');
        }

        return { ...resolved, token: resolved.token };
    }

    protected override async init(): Promise<void> {
        await super.init();
        // Read here, demanded lazily: this.parse() runs after init(), and input errors come first.
        this.#resolved = await openSession(this.config);
    }
}
