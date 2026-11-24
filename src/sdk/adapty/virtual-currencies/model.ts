/**
 * What every operation of the resource shares: the currency and its mappings as the server sends them.
 * Answers pass through exactly as they arrive, in snake_case, which is what --json prints.
 */

import type { Pagination } from '../pagination.js';

/** A one-time product gives its coins on each purchase. */
export type OneTimeMapping = {
    credit_per_purchase: number;
    product_id: string;
    product_type: 'one-time';
};

/** A subscription gives its coins on each period; null `credit_on_trial_start` gives no coins on a trial. */
export type SubscriptionMapping = {
    credit_on_trial_start: null | number;
    credit_per_cycle: number;
    expiring: boolean;
    product_id: string;
    product_type: 'subscription';
};

export type VirtualCurrencyMapping = OneTimeMapping | SubscriptionMapping;

export type VirtualCurrency = {
    code: string;
    created_at: string;
    description: null | string;
    name: string;
    products_count: number;
    /** Milliseconds since the epoch: the `expected_updated_at` token of the next write. */
    updated_at: number;
    virtual_currency_id: string;
};

export type VirtualCurrencyDetail = VirtualCurrency & {
    mappings: VirtualCurrencyMapping[];
};

export type VirtualCurrencyList = {
    data: VirtualCurrency[];
    meta: {
        pagination: Pagination;
        /** How many more currencies the app can have. */
        remaining_count: number;
    };
};

/** The product ids of an upsert, by what the batch did to each. */
export type MappingChanges = {
    created: string[];
    unchanged: string[];
    updated: string[];
};

export type UpsertedMappings = VirtualCurrencyDetail & {
    changes: MappingChanges;
};

/**
 * One mapping item of a create or an upsert, as the caller wrote it in the file. It is sent as it is: the
 * server owns the item rules (the keys of each type, the product of the app).
 */
export type MappingItem = Record<string, unknown>;

/** The token of a write: the `updated_at` of the read that the caller made its decision on. */
export type WriteToken = {
    expectedUpdatedAt?: number | undefined;
};
