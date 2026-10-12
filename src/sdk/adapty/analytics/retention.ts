import { toQueryRequest, validateQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment } from './model.js';
import type { AnalyticsQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

export type RetentionInput = AnalyticsQueryInput & {
    groupBy?: string | undefined;
    /** Count from the trial instead of from the first paid period. */
    useTrial?: boolean | undefined;
};

type RetentionRequest = QueryRequest & {
    segmentation?: string;
    use_trial?: boolean;
};

/** One retention period: `x` is the backend period number. */
export type RetentionPoint = {
    title: string;
    value: number;
    value_relative: number;
    x: number;
};

/** `value` and `first_value` are the subscribers of the first period. */
export type RetentionSegment = AnalyticsSegment & {
    first_value: number;
    value: number;
    values: RetentionPoint[];
};

export type RetentionData = AnalyticsData<RetentionSegment>;

export type RetentionMeta = AnalyticsMeta<{ segmentation: null | string; use_trial: boolean }>;

export type RetentionResponse = AnalyticsResponse<RetentionData, RetentionMeta>;

export const validateRetention = (input: RetentionInput): Issue[] => validateQuery(input);

export const toRetentionRequest = (input: RetentionInput): RetentionRequest => {
    const body: RetentionRequest = toQueryRequest(input);

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    if (input.useTrial !== undefined) {
        body.use_trial = input.useTrial;
    }

    return body;
};
