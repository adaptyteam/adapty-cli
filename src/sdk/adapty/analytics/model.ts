/**
 * What the six analytics operations share: one answer shape, so one parser reads all of them. Answers pass
 * through as the server sends them, in snake_case: that object is what --json prints.
 *
 * `data.segments` starts with the total (`is_total` true, `key` null); every other segment is one group, and its
 * `key` is the raw value that the filter of the grouping takes. No rows for the window: `segments` is empty.
 * A number is the backend's number: 0 stays 0, and null means the backend has no value.
 */

/** The vocabularies of the query fields, in the order the catalog lists them. */
export const periodUnits = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type PeriodUnit = (typeof periodUnits)[number];

export const revenueBases = ['gross', 'proceeds', 'net'] as const;
export type RevenueBasis = (typeof revenueBases)[number];

export const periodTypes = ['renewals', 'days'] as const;
export type PeriodType = (typeof periodTypes)[number];

export type AnalyticsSegment = {
    is_total: boolean;
    /**
     * Null for the total only. A group has the value that the filter of its grouping (the catalog's `filter`)
     * takes, as `values` lists it. The "No Data" group: the zero UUID for an id grouping, `no_offer` for an offer
     * type or category, `Uncategorized` for a duration, `""` for another text grouping; no filter selects it for
     * `store_product_id`, `flow_screen_id` and `period`.
     */
    key: null | string;
    /** The backend title, "No Data" included. */
    title: string;
};

/**
 * The query that ran: every field of the operation with its default, the filters as sent, the time zone and
 * where it comes from (`request` for `--timezone`, else `app`).
 */
export type ResolvedQuery<Fields> = Fields & {
    filters: Record<string, string[]>;
    timezone: string;
    timezone_source: 'app' | 'request';
};

export type AnalyticsMeta<Fields = Record<string, unknown>> = {
    query: ResolvedQuery<Fields>;
};

/** One amount in USD on each revenue basis. */
export type Money = {
    gross: number;
    net: number;
    proceeds: number;
};

export type AnalyticsResponse<Data, Meta> = {
    data: Data;
    meta: Meta;
};

/** Every data answer has these: the main number and the segments, total first. */
export type AnalyticsData<Segment extends AnalyticsSegment> = {
    segments: Segment[];
    value: null | number;
};
