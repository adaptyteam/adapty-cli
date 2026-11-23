import { DEFAULT_ADAPTY_API_URL } from '../../../sdk/adapty/index.js';
import { loadSession } from '../session.js';

import type { Region } from '../../input/region.js';
import type { ResolvedSession, SessionChoice } from '../session.js';
import type { Config } from '@oclif/core';

const REGION_API_URLS: Record<Region, string> = {
    eu: 'https://api-eu-admin.adapty.io/api/v1/developer',
    us: DEFAULT_ADAPTY_API_URL,
};

/** ADAPTY_API_URL is stronger than any region; the legacy ApiClient keeps its own copy of this table. */
const regionApiUrl = (region: Region): string => REGION_API_URLS[region];

/** The shared token and store, sent to the developer API: ADAPTY_API_URL, or the host of the region. */
export const resolveSession = async (config: Config, choice?: SessionChoice): Promise<ResolvedSession> => {
    const shared = await loadSession(config, choice);

    return { apiUrl: process.env.ADAPTY_API_URL ?? regionApiUrl(shared.region), ...shared };
};

export const openSession = async (config: Config, choice?: SessionChoice): Promise<ResolvedSession> => {
    const session = await resolveSession(config, choice);

    // A host that comes from the region is no surprise; only an override is compared with the US default
    if (process.env.ADAPTY_API_URL !== undefined && session.apiUrl !== DEFAULT_ADAPTY_API_URL) {
        // oclif's warn() is silent under --json; the destination warning must remain visible.
        process.stderr.write(`Warning: Using non-default API URL: ${session.apiUrl}\n`);
    }

    return session;
};
