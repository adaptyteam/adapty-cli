import { validateDateRange } from './report.js';

import type { RevenueBasis } from './report.js';
import type { Issue } from '../core/errors.js';

/** The values a dimension takes over a day range: what a report filter can be given. */
export type ValuesInput = {
    appId: string;
    dateFrom: string;
    dateTo: string;
    dimension: string;
    revenueBasis?: RevenueBasis | undefined;
};

type ValuesRequest = {
    app_id: string;
    date_from: string;
    date_to: string;
    dimension: string;
    revenue_basis?: RevenueBasis;
};

/** An item of a dimension whose catalog identity is `value`. */
export type ValuesItemByValue = {
    /** null for rows the backend could not attribute to any value. */
    value: null | string;
};

/** An item of a dimension whose catalog identity is `id`: an entity of one ad network. */
export type ValuesItemById = {
    channel: null | string;
    id: null | string;
    name: null | string;
};

export type ValuesData = {
    dimension: string;
    items: (ValuesItemById | ValuesItemByValue)[];
};

export type ValuesMeta = {
    query: Record<string, unknown>;
};

/** Whether the dimension exists is the catalog's knowledge, so the backend checks that. */
export const validateValues = (input: ValuesInput): Issue[] => {
    const issues = validateDateRange(input);

    if (input.dimension.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'dimension' });
    }

    return issues;
};

export const toValuesRequest = (input: ValuesInput): ValuesRequest => {
    const body: ValuesRequest = {
        app_id: input.appId,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        dimension: input.dimension,
    };

    if (input.revenueBasis !== undefined) {
        body.revenue_basis = input.revenueBasis;
    }

    return body;
};
