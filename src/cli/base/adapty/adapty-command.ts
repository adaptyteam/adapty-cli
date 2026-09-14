import { AuthRequiredError } from '../../../sdk/core/errors.js';
import { BaseCommand } from '../base-command.js';

import { build } from './build.js';
import { openSession } from './openSession.js';

import type { ResolvedSession } from './openSession.js';
import type { Adapty } from '../../../sdk/adapty/index.js';

export type AuthenticatedSession = ResolvedSession & { token: string };

/**
 * Commands that require a token; auth commands other than `whoami` also work without one.
 *
 * "Needs authorization" becomes a fact of the type system, written in what the command extends
 * instead of checked inside run(). One lazy class would put a "what if we are not logged in"
 * branch into all 75 commands, and one of them would forget it.
 */
export abstract class AdaptyCommand extends BaseCommand {
    // Keep one own static so oclif's manifest cache walks through this intermediate class and
    // includes statics inherited from BaseCommand.
    static override enableJsonFlag = true;

    #adapty: Adapty | undefined;
    #resolved: ResolvedSession | undefined;

    protected get adapty(): Adapty {
        this.#adapty ??= build(this.session, {
            config: this.config,
            signal: this.signal,
            warn: message => this.warn(message),
        });

        return this.#adapty;
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
        // The session is read here, the sdk built lazily from run(), because this.parse() runs
        // after init(). Demanding the token here would answer `apps list --pge 2` with "Not
        // authenticated" instead of "Nonexistent flag": input errors come before state errors.
        // Commands also validate business rules before accessing this.adapty or this.session.
        this.#resolved = await openSession(this.config);
    }
}
