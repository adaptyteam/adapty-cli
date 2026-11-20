import { regionApiUrl } from '../cli/base/adapty/index.js';

import { ApiClient } from './api-client.js';
import { resolveLegacySession } from './auth.js';
import { AuthRequiredError } from './errors.js';

import type { Config } from '@oclif/core';

export function buildUserAgent(config: Config): string {
    return `adapty-cli/${config.version} node/${process.version} ${process.platform}/${process.arch}`;
}

export async function createAuthenticatedClient(config: Config): Promise<ApiClient> {
    const { region, token } = await resolveLegacySession(config);

    if (!token) {
        throw new AuthRequiredError();
    }

    return new ApiClient({
        // Apart from the override: ADAPTY_API_URL still wins, and its warning still compares with the US default
        regionBaseUrl: regionApiUrl(region),
        token,
        userAgent: buildUserAgent(config),
    });
}
