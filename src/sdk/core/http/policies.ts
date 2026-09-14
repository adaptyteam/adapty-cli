import { ApiError, NetworkError } from '../errors.js';

import type { RetryDecision } from './retry.js';

/** How to pull code and message out of an error body. Developer API and ASA differ, so it is a parameter. */
export type ErrorParser = (status: number, body: unknown) => {
    code?: string | undefined;
    message?: string | undefined;
};

export type ShouldRetry = (error: unknown, attempt: number) => RetryDecision;

/** Default: network errors with backoff, 429 and 5xx after the delay the server asked for, if any. */
export const defaultShouldRetry: ShouldRetry = (error) => {
    if (error instanceof NetworkError) {
        return {};
    }

    if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) {
        return { delayMs: error.retryAfterMs };
    }

    return false;
};

/**
 * The default error format, tolerant of the three common body shapes:
 * { error: 'code', error_description }, { error: { code, message } }, { code, message | detail }.
 */
export const defaultErrorParser: ErrorParser = (_status, body) => {
    if (!isRecord(body)) {
        return {};
    }

    if (typeof body.error === 'string') {
        return { code: body.error, message: asString(body.error_description ?? body.message) };
    }

    if (isRecord(body.error)) {
        return { code: asString(body.error.code), message: asString(body.error.message) };
    }

    return { code: asString(body.code), message: asString(body.message ?? body.detail) };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
