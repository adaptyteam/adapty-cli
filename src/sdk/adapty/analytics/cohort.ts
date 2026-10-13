import { toGroupingRequest } from './query.js';
import { toRenewalPeriodsRequest, validateRenewalPeriods } from './renewal-periods.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment, Money, PeriodUnit } from './model.js';
import type { GroupingInput, GroupingRequest } from './query.js';
import type { RenewalPeriodsInput, RenewalPeriodsQuery, RenewalPeriodsRequest } from './renewal-periods.js';
import type { Issue } from '../../core/errors.js';

/** No grouping: each segment is one cohort already. `granularity` is the length of one cohort. */
export type CohortInput = Pick<GroupingInput, 'granularity'> & RenewalPeriodsInput;

type CohortRequest = Pick<GroupingRequest, 'period_unit'> & RenewalPeriodsRequest;

/**
 * One period of a cohort. `value` and `value_relative` are the revenue on the asked basis; the money fields
 * give each basis.
 */
export type CohortPoint = {
    arpas: Money;
    arppu: Money;
    arpu: Money;
    currently_active_period: boolean;
    installs: number;
    revenue: Money;
    revenue_relative: Money;
    subscribers: number;
    subscribers_relative: number;
    subscriptions: number;
    subscriptions_relative: number;
    value: number;
    value_relative: number;
    x: number;
};

/** Predicted revenue (`rev*`) and LTV (`ltv*`) after 3..24 months; null where the backend cannot predict. */
export type PredictValues = {
    ltv3: null | number;
    ltv6: null | number;
    ltv9: null | number;
    ltv12: null | number;
    ltv18: null | number;
    ltv24: null | number;
    rev3: null | number;
    rev6: null | number;
    rev9: null | number;
    rev12: null | number;
    rev18: null | number;
    rev24: null | number;
};

/** The backend predictions per basis (`gross_v2`: its second gross model); a section is null where it gives none. */
export type CohortPredict = {
    gross: null | PredictValues;
    gross_v2: null | PredictValues;
    net: null | PredictValues;
    proceeds: null | PredictValues;
    status: null | {
        status_3: null | number;
        status_6: null | number;
        status_9: null | number;
        status_12: null | number;
        status_18: null | number;
        status_24: null | number;
    };
};

/** One cohort, its start date as `key` (null for the total); `value` is its revenue on the asked basis. */
export type CohortSegment = AnalyticsSegment & {
    arpas: Money;
    arppu: Money;
    arpu: Money;
    installs: number;
    predict: CohortPredict | null;
    revenue: Money;
    start_date: null | string;
    subscribers: number;
    subscriptions: number;
    value: number;
    values: CohortPoint[];
};

export type CohortData = AnalyticsData<CohortSegment>;

export type CohortMeta = AnalyticsMeta<RenewalPeriodsQuery & { period_unit: PeriodUnit }>;

export type CohortResponse = AnalyticsResponse<CohortData, CohortMeta>;

export const validateCohort = (input: CohortInput): Issue[] => validateRenewalPeriods(input);

export const toCohortRequest = (input: CohortInput): CohortRequest =>
    ({ ...toRenewalPeriodsRequest(input), ...toGroupingRequest(input) });
