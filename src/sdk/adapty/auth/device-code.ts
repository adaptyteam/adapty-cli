import { CLIENT_ID } from './model.js';

import type { DeviceCode } from '../../core/auth/device-flow.js';
import type { Http } from '../../core/http/index.js';

type DeviceResponse = {
    device_code: string;
    expires_in: number;
    interval_seconds?: number;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
};

/**
 * Step one of the device flow: ask for the code the user will type. The path sits with the
 * reading of the answer, because here they are one thing — what core's port receives is this
 * server's response renamed, and the two cannot be understood apart.
 */
export const requestDeviceCode = async (http: Http): Promise<DeviceCode> => {
    const response = await http.post<DeviceResponse>('/auth/device', { client_id: CLIENT_ID });

    return {
        deviceCode: response.device_code,
        expiresInSec: response.expires_in,
        // optional in the protocol; the default is knowledge about this server, so it
        // belongs here and not in the orchestration
        intervalSec: response.interval_seconds ?? 5,
        userCode: response.user_code,
        verificationUri: response.verification_uri,
        verificationUriComplete: response.verification_uri_complete,
    };
};
