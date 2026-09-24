import { defaultErrorParser } from '../core/http/index.js';

import type { ErrorParser } from '../core/http/index.js';

type ErrorItem = {
    error_code?: unknown;
    field_name?: unknown;
    message?: unknown;
};

/**
 * How the attribution backend words a rejection: `{ errors: [{ message, error_code, status_code,
 * field_name }] }`. The code comes from the first item; the message joins every item, each prefixed
 * with the field it names, so "metrics: Unknown metric" reaches the user instead of an HTTP status.
 *
 * A body without the envelope (a proxy page, a framework-level 404) is read the default way.
 * A 401 never gets here: the transport turns it into AuthRequiredError whatever the body says.
 */
export const attributionErrorParser: ErrorParser = (status, body) => {
    if (typeof body !== 'object' || body === null) {
        return {};
    }

    const { errors } = body as { errors?: unknown };

    if (!Array.isArray(errors) || errors.length === 0) {
        return defaultErrorParser(status, body);
    }

    const items = errors as unknown[];
    const code = codeOf(items[0]);

    // The bare code as the fallback message: still better than an HTTP status
    return { code, message: itemMessages(items) ?? code };
};

const codeOf = (item: unknown): string | undefined => {
    if (typeof item !== 'object' || item === null) {
        return undefined;
    }

    const { error_code: errorCode } = item as ErrorItem;

    return typeof errorCode === 'string' && errorCode !== '' ? errorCode : undefined;
};

const itemMessages = (items: readonly unknown[]): string | undefined => {
    const parts: string[] = [];

    for (const item of items) {
        if (typeof item !== 'object' || item === null) {
            continue;
        }

        const { field_name: fieldName, message } = item as ErrorItem;

        if (typeof message !== 'string' || message === '') {
            continue;
        }

        parts.push(typeof fieldName === 'string' && fieldName !== '' ? `${fieldName}: ${message}` : message);
    }

    return parts.length > 0 ? parts.join('; ') : undefined;
};
