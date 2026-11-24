import type { Issue } from '../../core/errors.js';
import type { QueryParams } from '../../core/http/index.js';

/** One currency of a ledger row: what it changed and the balance after it. */
export type LedgerItem = {
    amount: number;
    balance_after: number;
    currency_code: string;
    expires_at: null | string;
};

export type LedgerRow = {
    created_at: string;
    customer_placement_id: null | string;
    feature: null | string;
    is_sandbox: boolean;
    items: LedgerItem[];
    metadata: null | Record<string, string>;
    operation: null | string;
    profile_id: string;
    reference_id: null | string;
    store: null | string;
    store_transaction_id: null | string;
    transaction_id: string;
    transaction_type: string;
};

/** A cursor page: there is no page count, only where the next page starts. */
export type CursorPagination = {
    has_more: boolean;
    next_cursor: null | string;
};

export type LedgerPage = {
    data: LedgerRow[];
    meta: {
        pagination: CursorPagination;
        /** The profile list names the profile it read. */
        profile_id?: string | undefined;
        /** The query that the server applied, its time zone included. */
        query: Record<string, unknown>;
    };
};

export type ExpiringAmount = {
    amount: number;
    expires_at: string;
};

export type Balance = {
    available: number;
    balance: number;
    code: string;
    expiry: {
        expired: number;
        expiring: ExpiringAmount[];
        expiring_later: number;
        non_expiring: number;
    };
    held: number;
    name: string;
};

export type Balances = {
    data: Balance[];
    meta: { profile_id: string };
    response_created_at: string;
};

/**
 * The filters and the page of a ledger read. The server owns every value list and the period rule, so a value
 * is sent as given; a next page needs the same filters and time zone, because the cursor is bound to them.
 */
export type LedgerQuery = {
    currencyCode?: string | undefined;
    cursor?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    feature?: string | undefined;
    operation?: string | undefined;
    pageSize?: number | undefined;
    sandbox?: boolean | undefined;
    timezone?: string | undefined;
};

export const ledgerQuery = (query: LedgerQuery): QueryParams => ({
    'filter[currency_code]': query.currencyCode,
    'filter[date_from]': query.dateFrom,
    'filter[date_to]': query.dateTo,
    'filter[feature]': query.feature,
    'filter[is_sandbox]': query.sandbox,
    'filter[operation]': query.operation,
    'page[cursor]': query.cursor,
    'page[size]': query.pageSize,
    'timezone': query.timezone,
});

/** A profile by its id or by the customer user id of the app: exactly one of the two. */
export type ProfileAddress = {
    customerUserId?: string | undefined;
    /** The profile id. */
    profile?: string | undefined;
};

/**
 * Two routes read a profile: its id in the path, or the customer user id in the query of the route with no id.
 * With both or neither the client would pick a route with no word to the caller, so it refuses.
 */
export const validateProfileAddress = (address: ProfileAddress): Issue[] => {
    const given = [address.profile, address.customerUserId].filter(value => value !== undefined).length;

    return given === 1
        ? []
        : [{
                fields: ['profile', 'customerUserId'],
                message: `${given === 0 ? 'name the profile' : 'pass only one of the two'}: {profile} or {customerUserId}`,
            }];
};

/** The path of a profile read and its query part: by id in the path, or by customer user id in the query. */
type ProfileRoute = { path: string; query: QueryParams };

export const profileRoute = (appId: string, address: ProfileAddress, leaf: string): ProfileRoute =>
    (address.profile === undefined
        ? { path: `/apps/${appId}/profiles/virtual-currencies/${leaf}`, query: { customer_user_id: address.customerUserId } }
        : { path: `/apps/${appId}/profiles/${address.profile}/virtual-currencies/${leaf}`, query: {} });
