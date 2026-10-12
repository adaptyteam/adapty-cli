import type { AnalyticsTable, Column } from './segments.js';
import type {
    AnalyticsSegment,
    ChartResponse,
    ChartSegment,
    CohortPredict,
    CohortResponse,
    CohortSegment,
    ConversionResponse,
    ConversionSegment,
    FunnelResponse,
    FunnelSegment,
    LtvResponse,
    LtvSegment,
    RetentionResponse,
    RetentionSegment,
} from '../../../sdk/adapty/index.js';

/** The fields every segment has, in the order the API sends them. */
const segmentColumns = <S extends AnalyticsSegment & { value: null | number }>(): Column<S>[] => [
    { name: 'key', read: segment => segment.key },
    { name: 'title', read: segment => segment.title },
    { name: 'is_total', read: segment => segment.is_total },
    { name: 'value', read: segment => segment.value },
];

export const chartTable: AnalyticsTable<ChartResponse, ChartSegment> = {
    columns: segmentColumns(),
    comparable: true,
    sections: ({ data }) => [
        { period: 'main', segments: data.segments, summary: [['value', data.value]] },
        ...(data.compare === null
            ? []
            : [{ period: 'compare' as const, segments: data.compare.segments, summary: [['value', data.compare.value]] as const }]),
    ],
};

export const conversionTable: AnalyticsTable<ConversionResponse, ConversionSegment> = {
    columns: [
        ...segmentColumns<ConversionSegment>(),
        { name: 'value_from', read: segment => segment.value_from },
        { name: 'value_to', read: segment => segment.value_to },
    ],
    comparable: true,
    emptyNotes: ({ meta }) => (meta.recommended_period === null
        ? []
        : [`recommended_period: date_from ${meta.recommended_period.date_from}, date_to ${meta.recommended_period.date_to}, `
            + `period_unit ${meta.recommended_period.period_unit}`]),
    sections: ({ data }) => [
        {
            period: 'main',
            segments: data.segments,
            summary: [['value', data.value], ['value_from', data.value_from], ['value_to', data.value_to]],
        },
        ...(data.compare === null
            ? []
            : [{
                    period: 'compare' as const,
                    segments: data.compare.segments,
                    summary: [['value', data.compare.value], ['value_from', data.compare.value_from], ['value_to', data.compare.value_to]] as const,
                }]),
    ],
};

export const funnelTable: AnalyticsTable<FunnelResponse, FunnelSegment> = {
    columns: segmentColumns(),
    comparable: false,
    sections: ({ data }) => [{ period: 'main', segments: data.segments, summary: [['value', data.value]] }],
};

export const retentionTable: AnalyticsTable<RetentionResponse, RetentionSegment> = {
    columns: [...segmentColumns<RetentionSegment>(), { name: 'first_value', read: segment => segment.first_value }],
    comparable: false,
    sections: ({ data }) => [{ period: 'main', segments: data.segments, summary: [['value', data.value]] }],
};

export const ltvTable: AnalyticsTable<LtvResponse, LtvSegment> = {
    columns: [...segmentColumns<LtvSegment>(), { name: 'cohort_size', read: segment => segment.cohort_size }],
    comparable: false,
    sections: ({ data }) => [{ period: 'main', segments: data.segments, summary: [['value', data.value]] }],
};

/** In the order the API sends them: revenue, then LTV, each by month. */
const predictFields: readonly (keyof CohortPredict)[] = [
    'rev3', 'rev6', 'rev9', 'rev12', 'rev18', 'rev24', 'ltv3', 'ltv6', 'ltv9', 'ltv12', 'ltv18', 'ltv24',
];

export const cohortTable: AnalyticsTable<CohortResponse, CohortSegment> = {
    columns: [
        ...segmentColumns<CohortSegment>(),
        ...(['installs', 'subscriptions', 'subscribers', 'arpu', 'arppu', 'arpas'] as const)
            .map(name => ({ name, read: (segment: CohortSegment) => segment[name] })),
        // A cohort the backend cannot predict has `predict: null`: every prediction is then empty, not 0
        ...predictFields.map(name => ({ name: `predict.${name}`, read: (segment: CohortSegment) => segment.predict?.[name] ?? null })),
    ],
    comparable: false,
    sections: ({ data }) => [{ period: 'main', segments: data.segments, summary: [['value', data.value]] }],
};
