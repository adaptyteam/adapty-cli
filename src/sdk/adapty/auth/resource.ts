import { requestDeviceCode } from './device-code.js';
import { pollToken } from './poll-token.js';

import type { IssuedToken } from './model.js';
import type { DeviceAuthApi } from '../../core/auth/device-flow.js';
import type { Http } from '../../core/http/index.js';

/**
 * The auth resource: core's DeviceAuthApi port filled in by the two device flow steps, plus the
 * endpoints that only need a path. A missing or stale token surfaces as AuthRequiredError.
 *
 * Unlike apps, not every path is listed here: a device flow step is its path and the reading of
 * its answer together, so each keeps its own. What is left in this file is the shape of the
 * resource — which port it satisfies, and what else it answers.
 */
export const auth = (http: Http) => {
    const deviceAuth: DeviceAuthApi<IssuedToken> = {
        pollToken: (deviceCode: string) => pollToken(http, deviceCode),
        requestDeviceCode: () => requestDeviceCode(http),
    };

    return {
        ...deviceAuth,
        me: () => http.get<Record<string, unknown>>('/me'),
        revokeToken: (token: string) => http.post<undefined>('/auth/tokens/revoke', { token }),
    };
};

export type AuthApi = ReturnType<typeof auth>;
