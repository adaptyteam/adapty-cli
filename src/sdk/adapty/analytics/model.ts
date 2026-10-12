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
    /** The raw value that `--filter <grouping>=<key>` takes; null for the total. */
    key: null | string;
    /** The backend title, "No Data" included. */
    title: string;
};

/** The query that ran: every field with its default, `timezone` and `timezone_source` (`request` or `app`). */
export type AnalyticsMeta = {
    query: Record<string, unknown>;
};

export type AnalyticsResponse<Data, Meta = AnalyticsMeta> = {
    data: Data;
    meta: Meta;
};

/** Every data answer has these: the main number and the segments, total first. */
export type AnalyticsData<Segment extends AnalyticsSegment> = {
    segments: Segment[];
    value: null | number;
};
