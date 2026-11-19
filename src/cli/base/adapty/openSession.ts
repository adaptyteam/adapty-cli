import { DEFAULT_ADAPTY_API_URL } from '../../../sdk/adapty/index.js';
import { loadSession } from '../session.js';

import type { Region } from '../../input/region.js';
import type { ResolvedSession } from '../session.js';
import type { Config } from '@oclif/core';

const REGION_API_URLS: Record<Region, string> = {
    eu: 'https://api-eu-admin.adapty.io/api/v1/developer',
    us: DEFAULT_ADAPTY_API_URL,
};

/**
 * The developer API host of a region: the one resolver both stacks take it from. ADAPTY_API_URL is
 * stronger than any region and stays each stack's own concern, with its own warning.
 */
export const regionApiUrl = (region: Region): string => REGION_API_URLS[region];

/** The shared token and store, sent to the developer API: ADAPTY_API_URL, or the host of the region. */
export const resolveSession = async (config: Config, region?: Region): Promise<ResolvedSession> => {
    const shared = await loadSession(config, region);

    return { apiUrl: process.env.ADAPTY_API_URL ?? regionApiUrl(shared.region), ...shared };
};

export const openSession = async (config: Config, region?: Region): Promise<ResolvedSession> => {
    const session = await resolveSession(config, region);

    // A host that comes from the region is no surprise; only an override is compared with the US default
    if (process.env.ADAPTY_API_URL !== undefined && session.apiUrl !== DEFAULT_ADAPTY_API_URL) {
        // oclif's warn() is silent under --json; the destination warning must remain visible.
        process.stderr.write(`Warning: Using non-default API URL: ${session.apiUrl}\n`);
    }

    return session;
};
