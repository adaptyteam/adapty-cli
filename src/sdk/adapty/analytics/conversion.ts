import { toGroupingRequest, toQueryRequest, validateComparableQuery } from './query.js';

import type { AnalyticsData, AnalyticsMeta, AnalyticsResponse, AnalyticsSegment, PeriodUnit } from './model.js';
import type { ComparableQueryInput, GroupingInput, GroupingRequest, QueryRequest } from './query.js';
import type { Issue } from '../../core/errors.js';

/** A conversion id as the catalog lists it; the backend knows which ids exist and never maps one id to another pair. */
export type ConversionId = string;

export type ConversionInput = ComparableQueryInput & GroupingInput & {
    conversionId: ConversionId;
};

type ConversionRequest = GroupingRequest & QueryRequest & {
    conversion_id: ConversionId;
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
/** `value_from` and `value_to` are null only on a compared total that the backend does not give. */
export type ConversionSegment = AnalyticsSegment & {
    value: number;
    value_from: null | number;
    value_to: null | number;
    values: ConversionPoint[];
};

export type ConversionData = AnalyticsData<ConversionSegment> & {
    /** The counts of the compared period itself; null when the backend has no total row for it. */
    compare: null | {
        segments: ConversionSegment[];
        value: number;
        value_from: null | number;
        value_to: null | number;
    };
    value: number;
    value_from: number;
    value_to: number;
};

export type ConversionMeta = AnalyticsMeta<{
    conversion_id: ConversionId;
    period_unit: PeriodUnit;
    segmentation: null | string;
}> & {
    /** A window with data, given when the asked window has none. */
    recommended_period: null | {
        date_from: string;
        date_to: string;
        period_unit: string;
    };
};

export type ConversionResponse = AnalyticsResponse<ConversionData, ConversionMeta>;

export const validateConversion = (input: ConversionInput): Issue[] => validateComparableQuery(input);

export const toConversionRequest = (input: ConversionInput): ConversionRequest => ({
    conversion_id: input.conversionId,
    ...toQueryRequest(input),
    ...toGroupingRequest(input),
});
