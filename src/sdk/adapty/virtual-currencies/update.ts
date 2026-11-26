import type { VirtualCurrencyDetail } from './model.js';
import type { Issue } from '../../core/errors.js';

/** A field left out keeps the stored value; a null description clears it. */
export type UpdateVirtualCurrencyInput = {
    description?: null | string | undefined;
    name?: string | undefined;
};

/** Rules that need no stored currency, so they run before the first request. */
export const validateUpdateVirtualCurrency = (input: UpdateVirtualCurrencyInput): Issue[] =>
    (input.name === undefined && input.description === undefined
        ? [{
                fields: ['name', 'description', 'clearDescription'],
                message: 'nothing to update: pass {name}, {description} or {clearDescription}',
            }]
        : []);

/**
 * The server takes both keys and clears the description on null, so a field the caller did not give is sent
 * as read. The token is the `updated_at` of that read: a change in between is a 409, not a silent revert.
 */
export const updateBody = (
    stored: VirtualCurrencyDetail,
    input: UpdateVirtualCurrencyInput,
): Record<string, unknown> => ({
    description: input.description === undefined ? stored.description : input.description,
    expected_updated_at: stored.updated_at,
    name: input.name ?? stored.name,
});
