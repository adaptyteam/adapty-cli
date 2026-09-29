import { DEFAULT_ATTRIBUTION_API_URL } from '../../../sdk/attribution/index.js';
import { loadSession } from '../session.js';

import type { ResolvedSession } from '../session.js';
import type { Config } from '@oclif/core';

/**
 * The attribution backend takes the Adapty developer token, so the token, its source, the store and
 * the user are the shared session as it is. Only the destination is this product's own:
 * ADAPTY_ATTRIBUTION_API_URL, independent of ADAPTY_API_URL.
 */
export const resolveAttributionSession = async (config: Config): Promise<ResolvedSession> => ({
    apiUrl: process.env.ADAPTY_ATTRIBUTION_API_URL ?? DEFAULT_ATTRIBUTION_API_URL,
    ...await loadSession(config),
});

export const openSession = async (config: Config): Promise<ResolvedSession> => {
    const session = await resolveAttributionSession(config);

    if (session.apiUrl !== DEFAULT_ATTRIBUTION_API_URL) {
        // oclif's warn() is silent under --json; the destination warning must remain visible.
        process.stderr.write(`Warning: Using non-default attribution API URL: ${session.apiUrl}\n`);
    }

    return session;
};
