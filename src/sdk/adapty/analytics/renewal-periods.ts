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

/** The fields of the resolved query that LTV and cohorts share. */
export type RenewalPeriodsQuery = {
    period_type: PeriodType;
    renewal_days: null | number[];
    revenue_basis: RevenueBasis;
};

export type RenewalPeriodsRequest = QueryRequest & {
    period_type?: PeriodType;
    renewal_days?: number[];
    revenue_basis?: RevenueBasis;
};

export const validateRenewalPeriods = (input: RenewalPeriodsInput): Issue[] => {
    const issues = validateQuery(input);

    if (input.renewalDays !== undefined && input.periodType !== 'days') {
        issues.push({ message: 'needs {periodType} days', path: 'renewalDays' });
    }

    // The backend reads the list as given: whole days, ascending, each once; anything else it refuses
    const days = input.renewalDays ?? [];
    const ordered = days.every((day, index) => index === 0 || day > (days[index - 1] ?? day));

    if (days.some(day => !Number.isInteger(day) || day < 0) || !ordered) {
        issues.push({ message: 'must be whole days, 0 or more, in ascending order, each day once', path: 'renewalDays' });
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
