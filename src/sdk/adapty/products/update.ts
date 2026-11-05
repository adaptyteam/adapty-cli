import type { Product } from './model.js';
import type { Issue } from '../../core/errors.js';

export type UpdateProductInput = {
    accessLevelId?: string | undefined;
    /** The server sets it only while the product has no price: a set price stays. */
    priceUsd?: number | undefined;
    title?: string | undefined;
};

export const validateUpdateProduct = (input: UpdateProductInput): Issue[] => {
    if (input.title === undefined && input.accessLevelId === undefined && input.priceUsd === undefined) {
        return [{ message: 'nothing to update: pass a title, an access level or a USD price' }];
    }

    const issues: Issue[] = [];

    if (input.title?.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'title' });
    }

    if (input.priceUsd !== undefined && !(Number.isFinite(input.priceUsd) && input.priceUsd >= 0)) {
        issues.push({ message: 'must be a number of 0 or more', path: 'priceUsd' });
    }

    return issues;
};

type UpdateProductRequest = {
    access_level_id: string;
    price_usd?: number;
    title: string;
};

/** The server takes the whole product: the fields that are not given come from the stored one. */
export const toUpdateRequest = (stored: Product, input: UpdateProductInput): UpdateProductRequest => ({
    access_level_id: input.accessLevelId ?? stored.access_level_id,
    title: input.title ?? stored.title,
    ...(input.priceUsd === undefined ? {} : { price_usd: input.priceUsd }),
});
