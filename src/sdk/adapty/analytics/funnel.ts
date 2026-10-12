import { toQueryRequest, validateQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment } from './model.js';
import type { AnalyticsQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** No compared period: the funnel query mixes two date ranges into one, so the backend refuses it. */
export type FunnelInput = AnalyticsQueryInput & {
    groupBy?: string | undefined;
};

type FunnelRequest = QueryRequest & {
    segmentation?: string;
};

/** A count with its share in percent: a drop-off or pick-up, a churn reason, a part of a step. */
export type Share = {
    title: string;
    value: number;
    value_relative: number;
};

/**
 * One funnel step: `x` is the backend step number. `relative_changes` is the share that reaches the next step,
 * `following_changes` the drop-off (or pick-up) to it, `churn_reasons` why users left before this step, and
 * `parts` splits the first paid step into Install → Paid and Trial → Paid.
 */
export type FunnelStep = {
    churn_reason_title: string;
    churn_reasons: Share[];
    following_changes: Share;
    parts: Share[];
    relative_changes: number;
    title: string;
    value: number;
    value_relative: number;
    x: number;
};

/** `value` is the first step, the installs. */
export type FunnelSegment = AnalyticsSegment & {
    value: number;
    values: FunnelStep[];
};

export type FunnelData = AnalyticsData<FunnelSegment>;

export type FunnelMeta = AnalyticsMeta<{ segmentation: null | string }>;

export type FunnelResponse = AnalyticsResponse<FunnelData, FunnelMeta>;

export const validateFunnel = (input: FunnelInput): Issue[] => validateQuery(input);

export const toFunnelRequest = (input: FunnelInput): FunnelRequest => {
    const body: FunnelRequest = toQueryRequest(input);

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    return body;
};
