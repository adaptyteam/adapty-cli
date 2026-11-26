import type { MappingItem, WriteToken } from './model.js';
import type { Issue } from '../../core/errors.js';

const isObject = (value: unknown): value is MappingItem =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The form of a mapping file, checked before any request: a list with at least one item, each an object. What
 * an item holds is the server's rule, so a wrong key or a wrong type is its 400.
 */
export const validateMappingItems = (value: unknown): Issue[] => {
    if (!Array.isArray(value) || value.length === 0) {
        return [{ message: 'must hold a JSON array with at least one mapping object', path: 'file' }];
    }

    const others = value.flatMap((item, index) => (isObject(item) ? [] : [String(index + 1)]));

    return others.length === 0
        ? []
        : [{ message: `items ${others.join(', ')} are not objects: each item is one mapping object`, path: 'file' }];
};

/** The body of an upsert: the items as they are; the token only when there is one. */
export const upsertBody = (items: readonly MappingItem[], token: WriteToken): Record<string, unknown> => ({
    upsert: items,
    ...(token.expectedUpdatedAt === undefined ? {} : { expected_updated_at: token.expectedUpdatedAt }),
});
