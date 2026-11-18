import { ApiError, isSdkError } from '../../sdk/core/errors.js';

/**
 * `hypotheses.0.title: ...` at the start of each `; `-joined field message: the server counts the batch
 * items from 0, the file and the local checks from 1.
 */
const ITEM_PATH = /(^|; )hypotheses\.(\d+)(?:\.([^\s:]+))?: /g;

const withMessage = (error: ApiError, message: string): ApiError => new ApiError({
    code: error.code,
    details: error.details,
    message,
    retryAfterMs: error.retryAfterMs,
    status: error.status,
});

/** A create error in the words of the file: `item 2, title: ...`, or only `title: ...` for a single item. */
export const withItemPaths = (error: unknown, itemCount: number): unknown => {
    if (!isSdkError(error) || error.kind !== 'api') {
        return error;
    }

    const message = error.message.replace(ITEM_PATH, (_match, lead: string, index: string, field?: string) => {
        const item = itemCount === 1 ? undefined : `item ${String(Number(index) + 1)}`;
        const prefix = [item, field].filter(part => part !== undefined).join(', ');

        return prefix === '' ? lead : `${lead}${prefix}: `;
    });

    return message === error.message ? error : withMessage(error, message);
};
