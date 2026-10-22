import { toGroupingRequest, toQueryRequest, validateComparableQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment, PeriodUnit, RevenueBasis } from './model.js';
import type { ComparableQueryInput, GroupingInput, GroupingRequest, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** A chart id as the catalog lists it; the backend knows which ids exist. */
export type ChartId = string;

export type ChartInput = ComparableQueryInput & GroupingInput & {
    chartId: ChartId;
    /** Money charts only; the backend refuses it for the others (exit 4). */
    revenueBasis?: RevenueBasis | undefined;
};

type ChartRequest = GroupingRequest & QueryRequest & {
    chart_id: ChartId;
    revenue_basis?: RevenueBasis;
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

export const validateChart = (input: ChartInput): Issue[] => validateComparableQuery(input);

export const toChartRequest = (input: ChartInput): ChartRequest => {
    const body: ChartRequest = { chart_id: input.chartId, ...toQueryRequest(input), ...toGroupingRequest(input) };

    return input.revenueBasis === undefined ? body : { ...body, revenue_basis: input.revenueBasis };
};
