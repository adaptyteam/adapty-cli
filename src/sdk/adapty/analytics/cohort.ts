import { toRenewalPeriodsRequest, validateRenewalPeriods } from './renewal-periods.js';

import type { AnalyticsData, AnalyticsResponse, AnalyticsSegment, PeriodUnit } from './model.js';
import type { RenewalPeriodsInput, RenewalPeriodsRequest } from './renewal-periods.js';
import type { Issue } from '../../core/errors.js';

/** No grouping: each segment is one cohort already. */
export type CohortInput = RenewalPeriodsInput & {
    /** The length of one cohort. */
    granularity?: PeriodUnit | undefined;
};

type CohortRequest = RenewalPeriodsRequest & {
    period_unit?: PeriodUnit;
};

/** The money fields are on the asked revenue basis. */
export type CohortPoint = {
    arpas: number;
    arppu: number;
    arpu: number;
    currently_active_period: boolean;
    installs: number;
    subscribers: number;
    subscribers_relative: number;
    subscriptions: number;
    subscriptions_relative: number;
    value: number;
    value_relative: number;
    x: number;
};

/** Predicted revenue (`rev*`) and LTV (`ltv*`) after 3..24 months; null where the backend cannot predict. */
export type CohortPredict = {
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

/** One cohort, its start date as `key`; `value` is its revenue on the asked basis. */
export type CohortSegment = AnalyticsSegment & {
    arpas: number;
    arppu: number;
    arpu: number;
    installs: number;
    predict: CohortPredict | null;
    subscribers: number;
    subscriptions: number;
    value: number;
    values: CohortPoint[];
};

export type CohortData = AnalyticsData<CohortSegment>;

export type CohortResponse = AnalyticsResponse<CohortData>;

export const validateCohort = (input: CohortInput): Issue[] => validateRenewalPeriods(input);

export const toCohortRequest = (input: CohortInput): CohortRequest => {
    const body: CohortRequest = toRenewalPeriodsRequest(input);

    if (input.granularity !== undefined) {
        body.period_unit = input.granularity;
    }

    return body;
};
