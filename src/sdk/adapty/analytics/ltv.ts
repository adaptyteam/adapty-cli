import { toGroupingRequest } from './query.js';
import { toRenewalPeriodsRequest, validateRenewalPeriods } from './renewal-periods.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment } from './model.js';
import type { GroupingInput, GroupingRequest } from './query.js';
import type { RenewalPeriodsInput, RenewalPeriodsQuery, RenewalPeriodsRequest } from './renewal-periods.js';
import type { Issue } from '../../core/errors.js';

export type LtvInput = Pick<GroupingInput, 'groupBy'> & RenewalPeriodsInput;

type LtvRequest = Pick<GroupingRequest, 'segmentation'> & RenewalPeriodsRequest;

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

export type LtvMeta = AnalyticsMeta<RenewalPeriodsQuery & { segmentation: null | string }>;

export type LtvResponse = AnalyticsResponse<LtvData, LtvMeta>;

export const validateLtv = (input: LtvInput): Issue[] => validateRenewalPeriods(input);

export const toLtvRequest = (input: LtvInput): LtvRequest =>
    ({ ...toRenewalPeriodsRequest(input), ...toGroupingRequest(input) });
