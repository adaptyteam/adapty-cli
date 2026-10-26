import { hasStoreId, winBackIssues } from './model.js';

import type { OfferWrite } from './model.js';
import type { Issue } from '../../core/errors.js';

export type CreateProductOfferInput = OfferWrite;

/** A list of problems, knowing nothing about flags or the network. A path names an input field. */
export const validateCreateProductOffer = (input: CreateProductOfferInput): Issue[] => {
    const issues: Issue[] = [];

    if (input.title.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'title' });
    }

    if (!hasStoreId(input)) {
        issues.push({ fields: ['iosOfferId', 'androidOfferId'], message: 'pass {iosOfferId}, {androidOfferId} or both' });
    }

    return [...issues, ...winBackIssues(input)];
};
