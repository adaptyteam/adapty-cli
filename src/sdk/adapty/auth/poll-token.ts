import { ApiError } from '../../core/errors.js';

import { CLIENT_ID } from './model.js';

import type { AuthUser, IssuedToken } from './model.js';
import type { PollResult } from '../../core/auth/device-flow.js';
import type { Http } from '../../core/http/index.js';

type TokenSuccessResponse = {
    access_token: string;
    expires_in: number;
    token_type: string;
    user: AuthUser;
};

type TokenResponse = TokenSuccessResponse | { error: string };

/** A 400 carrying one of these codes is a state of the protocol, not a failure. */
const pollResultByCode: Record<string, PollResult<IssuedToken>> = {
    access_denied: { status: 'denied' },
    authorization_pending: { status: 'pending' },
    expired_token: { status: 'expired' },
    slow_down: { status: 'slow_down' },
};

/** A protocol code as a state, or a real error when the code is not one of the protocol's. */
const toPollResult = (code: string, body: unknown): PollResult<IssuedToken> => {
    const result = pollResultByCode[code];

    if (result === undefined) {
        throw new ApiError({
            code,
            details: body,
            message: `Unexpected device flow response: ${code}`,
            status: 200,
        });
    }

    return result;
};

/**
 * Step two, asked over and over until the user is done: the answer is a token, a state of the
 * protocol, or a failure — and telling the three apart is the whole of this operation.
 */
export const pollToken = async (http: Http, deviceCode: string): Promise<PollResult<IssuedToken>> => {
    try {
        const response = await http.post<TokenResponse>('/auth/token', {
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });

        // A protocol state normally arrives as a 400 and lands in the catch below, but the
        // shipped CLI's types also anticipate a 200 whose body is { error: <code> }, and
        // reading only the thrown case would call a pending login authorized.
        if (!('access_token' in response)) {
            return toPollResult(response.error, response);
        }

        return {
            status: 'authorized',
            token: {
                accessToken: response.access_token,
                expiresInSec: response.expires_in,
                user: response.user,
            },
        };
    } catch (error) {
        if (error instanceof ApiError && error.code !== undefined) {
            const result = pollResultByCode[error.code];

            if (result) {
                return result;
            }
        }

        throw error;
    }
};
