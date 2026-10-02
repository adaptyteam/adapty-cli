import { buildUserAgent } from '../../../lib/client-from-config.js';
import { createAdapty } from '../../../sdk/adapty/index.js';

import type { Adapty } from '../../../sdk/adapty/index.js';
import type { CommandContext } from '../base-command.js';
import type { ResolvedSession } from '../session.js';

/** The Adapty sdk also tells the server whether a person is watching (`X-Adapty-Interactive`). */
type AdaptyCommandContext = CommandContext & { interactive: boolean };

/** Shared by authenticated commands and login/revoke, which can run without a token. */
export const build = (session: ResolvedSession, context: AdaptyCommandContext): Adapty => createAdapty({
    baseUrl: session.apiUrl,
    interactive: context.interactive,
    onRetry: ({ attempt, delayMs }) => {
        context.warn(`Request failed, retrying in ${delayMs / 1000}s (attempt ${attempt + 1})`);
    },
    signal: context.signal,
    token: session.token,
    // Both CLI stacks use the same User-Agent while migration is in progress.
    userAgent: buildUserAgent(context.config),
});
