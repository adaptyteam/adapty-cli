import { toRenewalPeriodsRequest, validateRenewalPeriods } from './renewal-periods.js';

import type { AnalyticsData, AnalyticsResponse, AnalyticsSegment } from './model.js';
import type { RenewalPeriodsInput, RenewalPeriodsRequest } from './renewal-periods.js';
import type { Issue } from '../../core/errors.js';

export type LtvInput = RenewalPeriodsInput & {
    groupBy?: string | undefined;
};

type LtvRequest = RenewalPeriodsRequest & {
    segmentation?: string;
};

/** `value` is null for a renewal period (or day) that the cohort has not reached yet. */
export type LtvPoint = {
    value: null | number;
    x: number;
};

export type LtvSegment = AnalyticsSegment & {
    cohort_size: number;
    value: number;
    values: LtvPoint[];
};

export type LtvData = AnalyticsData<LtvSegment> & {
    value: number;
};

export type LtvResponse = AnalyticsResponse<LtvData>;

export const validateLtv = (input: LtvInput): Issue[] => validateRenewalPeriods(input);

export const toLtvRequest = (input: LtvInput): LtvRequest => {
    const body: LtvRequest = toRenewalPeriodsRequest(input);

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    return body;
};
