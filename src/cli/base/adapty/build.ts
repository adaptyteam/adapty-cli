import { buildUserAgent } from '../../../lib/client-from-config.js';
import { createAdapty } from '../../../sdk/adapty/index.js';

import type { ResolvedSession } from './openSession.js';
import type { Adapty } from '../../../sdk/adapty/index.js';
import type { Config } from '@oclif/core';

type CommandContext = {
    config: Config;
    signal: AbortSignal;
    warn: (message: string) => void;
};

/** Shared by authenticated commands and login/revoke, which can run without a token. */
export const build = (session: ResolvedSession, context: CommandContext): Adapty => createAdapty({
    baseUrl: session.apiUrl,
    onRetry: ({ attempt, delayMs }) => {
        context.warn(`Request failed, retrying in ${delayMs / 1000}s (attempt ${attempt + 1})`);
    },
    signal: context.signal,
    token: session.token,
    // Both CLI stacks use the same User-Agent while migration is in progress.
    userAgent: buildUserAgent(context.config),
});
