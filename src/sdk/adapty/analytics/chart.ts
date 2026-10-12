import { toQueryRequest, validateComparableQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment, PeriodUnit, RevenueBasis } from './model.js';
import type { ComparableQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** The charts of the dashboard charts page that the backend answers, in the catalog order. */
export const chartIds = [
    'revenue',
    'mrr',
    'arr',
    'arppu',
    'subscriptions_active',
    'subscriptions_new',
    'subscriptions_renewal_cancelled',
    'subscriptions_expired',
    'trials_active',
    'trials_new',
    'trials_renewal_cancelled',
    'trials_expired',
    'refund_events',
    'refund_money',
    'grace_period',
    'billing_issue',
    'non_subscriptions',
    'arpu',
    'installs',
    'billing_issue_converted',
    'billing_issue_converted_revenue',
    'grace_period_converted',
    'grace_period_converted_revenue',
] as const;

export type ChartId = (typeof chartIds)[number];

/** The charts the backend answers on three revenue bases: the only ones that take `revenueBasis`. */
export const moneyChartIds: readonly ChartId[] = [
    'revenue',
    'mrr',
    'arr',
    'arppu',
    'arpu',
    'refund_money',
    'billing_issue_converted_revenue',
    'grace_period_converted_revenue',
];

export type ChartInput = ComparableQueryInput & {
    chartId: ChartId;
    granularity?: PeriodUnit | undefined;
    /** A grouping key of this chart, as the catalog lists it; the backend refuses any other. */
    groupBy?: string | undefined;
    /** Money charts only; the backend refuses it for the others. */
    revenueBasis?: RevenueBasis | undefined;
};

type ChartRequest = QueryRequest & {
    chart_id: ChartId;
    period_unit?: PeriodUnit;
    revenue_basis?: RevenueBasis;
    segmentation?: string;
};

export type ChartPoint = {
    value: number;
    x: string;
};

export type ChartSegment = AnalyticsSegment & {
    value: number;
    values: ChartPoint[];
};

export type ChartData = AnalyticsData<ChartSegment> & {
    /** The compared period, built from that period only; null without one and when neither period has rows. */
    compare: null | {
        segments: ChartSegment[];
        value: number;
    };
    value: number;
};

export type ChartMeta = AnalyticsMeta<{
    chart_id: ChartId;
    period_unit: PeriodUnit;
    /** Null for a chart that is not about money. */
    revenue_basis: null | RevenueBasis;
    segmentation: null | string;
}>;

export type ChartResponse = AnalyticsResponse<ChartData, ChartMeta>;

export const validateChart = (input: ChartInput): Issue[] => {
    const issues = validateComparableQuery(input);

    // The backend refuses it too; refused here, a wrong combination costs no request and names the flag
    if (input.revenueBasis !== undefined && !moneyChartIds.includes(input.chartId)) {
        issues.push({ message: `applies only to a money chart: ${moneyChartIds.join(', ')}`, path: 'revenueBasis' });
    }

    return issues;
};

export const toChartRequest = (input: ChartInput): ChartRequest => {
    const body: ChartRequest = { chart_id: input.chartId, ...toQueryRequest(input) };

    if (input.granularity !== undefined) {
        body.period_unit = input.granularity;
    }

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    if (input.revenueBasis !== undefined) {
        body.revenue_basis = input.revenueBasis;
    }

    return body;
};
