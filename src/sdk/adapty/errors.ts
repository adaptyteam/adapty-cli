import type { ErrorParser } from '../core/http/index.js';

type DeveloperErrorBody = {
    error?: unknown;
    error_code?: unknown;
    errors?: unknown;
};

/**
 * How this service words a rejection: `{ error_code, errors: { field: [message] } }`, sometimes
 * just `{ error: 'code' }`. Ported from src/lib/errors.ts so a migrated command keeps saying
 * "apple_bundle_id: already used" instead of "POST /apps failed with HTTP 400".
 *
 * Wired once in createAdapty: which shapes a service speaks is product knowledge, and ASA speaks
 * another — which is why the transport takes the parser as a parameter.
 */
export const developerErrorParser: ErrorParser = (_status, body) => {
    if (typeof body !== 'object' || body === null) {
        return {};
    }

    const { error, error_code: errorCode, errors } = body as DeveloperErrorBody;

    if (typeof errorCode === 'string' && errorCode !== '') {
        // The bare code as the fallback message: what the published CLI prints, and still better
        // than an HTTP status when the server sends no field errors
        return { code: errorCode, message: fieldMessages(errors) ?? errorCode };
    }

    if (typeof error === 'string' && error !== '') {
        return { code: error, message: error };
    }

    return {};
};

/** `non_field_errors` is the server's name for "about the request as a whole": printed bare. */
const fieldMessages = (errors: unknown): string | undefined => {
    if (typeof errors !== 'object' || errors === null) {
        return undefined;
    }

    const parts: string[] = [];

    for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
        for (const message of Array.isArray(messages) ? (messages as unknown[]) : [messages]) {
            if (typeof message === 'string') {
                parts.push(field === 'non_field_errors' ? message : `${field}: ${message}`);
            }
        }
    }

    return parts.length > 0 ? parts.join('; ') : undefined;
};
