import { buildUserAgent } from '../../../lib/client-from-config.js';
import { createAttribution } from '../../../sdk/attribution/index.js';

import type { Attribution } from '../../../sdk/attribution/index.js';
import type { ResolvedSession } from '../adapty/index.js';
import type { CommandContext } from '../base-command.js';

/** Mirrors the Adapty build: the retry warning is heard only on the catalog reads, the POSTs never retry. */
export const build = (session: ResolvedSession, context: CommandContext): Attribution => createAttribution({
    baseUrl: session.apiUrl,
    onRetry: ({ attempt, delayMs }) => {
        context.warn(`Request failed, retrying in ${delayMs / 1000}s (attempt ${attempt + 1})`);
    },
    signal: context.signal,
    token: session.token,
    userAgent: buildUserAgent(context.config),
});
