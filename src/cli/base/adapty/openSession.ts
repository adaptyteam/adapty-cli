import { DEFAULT_ADAPTY_API_URL } from '../../../sdk/adapty/index.js';
import { loadSession } from '../session.js';

import type { ResolvedSession } from '../session.js';
import type { Config } from '@oclif/core';

/** The shared token and store, sent to the developer API: ADAPTY_API_URL, or the default. */
export const resolveSession = async (config: Config): Promise<ResolvedSession> => ({
    apiUrl: process.env.ADAPTY_API_URL ?? DEFAULT_ADAPTY_API_URL,
    ...await loadSession(config),
});

export const openSession = async (config: Config): Promise<ResolvedSession> => {
    const session = await resolveSession(config);

    if (session.apiUrl !== DEFAULT_ADAPTY_API_URL) {
        // oclif's warn() is silent under --json; the destination warning must remain visible.
        process.stderr.write(`Warning: Using non-default API URL: ${session.apiUrl}\n`);
    }

    return session;
};
