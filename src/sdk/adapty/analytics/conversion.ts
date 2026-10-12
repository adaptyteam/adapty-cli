import { toQueryRequest, validateComparableQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment, PeriodUnit } from './model.js';
import type { ComparableQueryInput, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** The conversions of the dashboard, by the ids it uses; the backend never maps one id to another pair. */
export const conversionIds = [
    'install-paid',
    'install-trial',
    'view-trial',
    'view-paid',
    'trial-paid',
    'paid-2period',
    '2period-3period',
    '3period-4period',
    '4period-5period',
    'paid-6month',
    'paid-1year',
    'paid-2year',
    'billing-issue-paid',
    'grace-period-paid',
] as const;

export type ConversionId = (typeof conversionIds)[number];

export type ConversionInput = ComparableQueryInput & {
    conversionId: ConversionId;
    granularity?: PeriodUnit | undefined;
    groupBy?: string | undefined;
};

type ConversionRequest = QueryRequest & {
    conversion_id: ConversionId;
    period_unit?: PeriodUnit;
    segmentation?: string;
};

export type ConversionPoint = {
    has_unfinished: boolean;
    value: number;
    value_from: number;
    value_from_unfinished: number;
    value_to: number;
    x: string;
};

/** `value` is the conversion in percent: `value_to` of `value_from`. */
export type ConversionSegment = AnalyticsSegment & {
    value: number;
    value_from: number;
    value_to: number;
    values: ConversionPoint[];
};

export type ConversionData = AnalyticsData<ConversionSegment> & {
    compare: null | {
        segments: ConversionSegment[];
        value: number;
        value_from: number;
        value_to: number;
    };
    value: number;
    value_from: number;
    value_to: number;
};

export type ConversionMeta = AnalyticsMeta & {
    /** A window with data, given when the asked window has none. */
    recommended_period: null | {
        date_from: string;
        date_to: string;
        period_unit: string;
    };
};

export type ConversionResponse = AnalyticsResponse<ConversionData, ConversionMeta>;

export const validateConversion = (input: ConversionInput): Issue[] => validateComparableQuery(input);

export const toConversionRequest = (input: ConversionInput): ConversionRequest => {
    const body: ConversionRequest = { conversion_id: input.conversionId, ...toQueryRequest(input) };

    if (input.granularity !== undefined) {
        body.period_unit = input.granularity;
    }

    if (input.groupBy !== undefined) {
        body.segmentation = input.groupBy;
    }

    return body;
};
