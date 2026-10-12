import { toQueryRequest, validateQuery } from './query.js';

import type { StepPoint } from './funnel.js';
import type { AnalyticsData, AnalyticsResponse, AnalyticsSegment } from './model.js';
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

/** `value` and `first_value` are the subscribers of the first period. */
export type RetentionSegment = AnalyticsSegment & {
    first_value: number;
    value: number;
    values: StepPoint[];
};

export type RetentionData = AnalyticsData<RetentionSegment>;

export type RetentionResponse = AnalyticsResponse<RetentionData>;

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
