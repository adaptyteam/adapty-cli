import { toQueryRequest, validateQuery } from './query.js';

import type { PeriodType, RevenueBasis } from './model.js';
import type { AnalyticsQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** What LTV and cohorts share: revenue on a basis, counted per renewal or per day. */
export type RenewalPeriodsInput = AnalyticsQueryInput & {
    periodType?: PeriodType | undefined;
    /** Whole days, 0 or more; only with `periodType: 'days'`. The backend list applies when left out. */
    renewalDays?: readonly number[] | undefined;
    revenueBasis?: RevenueBasis | undefined;
};

export type RenewalPeriodsRequest = QueryRequest & {
    period_type?: PeriodType;
    renewal_days?: number[];
    revenue_basis?: RevenueBasis;
};

export const validateRenewalPeriods = (input: RenewalPeriodsInput): Issue[] => {
    const issues = validateQuery(input);

    if (input.renewalDays !== undefined && input.periodType !== 'days') {
        issues.push({ message: 'needs --period-type days', path: 'renewalDays' });
    }

    if (input.renewalDays?.some(day => !Number.isInteger(day) || day < 0)) {
        issues.push({ message: 'must be whole days, 0 or more', path: 'renewalDays' });
    }

    return issues;
};

export const toRenewalPeriodsRequest = (input: RenewalPeriodsInput): RenewalPeriodsRequest => {
    const body: RenewalPeriodsRequest = toQueryRequest(input);

    if (input.revenueBasis !== undefined) {
        body.revenue_basis = input.revenueBasis;
    }

    if (input.periodType !== undefined) {
        body.period_type = input.periodType;
    }

    if (input.renewalDays !== undefined) {
        body.renewal_days = [...input.renewalDays];
    }

    return body;
};
