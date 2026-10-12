import { toQueryRequest, validateQuery } from './query.js';

import type { AnalyticsData, AnalyticsResponse, AnalyticsSegment } from './model.js';
import type { AnalyticsQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** No compared period: the funnel query mixes two date ranges into one, so the backend refuses it. */
export type FunnelInput = AnalyticsQueryInput & {
    groupBy?: string | undefined;
};

type FunnelRequest = QueryRequest & {
    segmentation?: string;
};

/** A funnel step or a retention period: `x` is the backend period number, `title` its name. */
export type StepPoint = {
    title: string;
    value: number;
    value_relative: number;
    x: number;
};

/** `value` is the first step, the installs; null for a segment without steps. */
export type FunnelSegment = AnalyticsSegment & {
    value: null | number;
    values: StepPoint[];
};

export type FunnelData = AnalyticsData<FunnelSegment>;

export type FunnelResponse = AnalyticsResponse<FunnelData>;

export const validateFunnel = (input: FunnelInput): Issue[] => validateQuery(input);

export const toFunnelRequest = (input: FunnelInput): FunnelRequest => {
    const body: FunnelRequest = toQueryRequest(input);

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    return body;
};
