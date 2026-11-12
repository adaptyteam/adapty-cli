import { pageQuery } from '../pagination.js';

import type { HypothesisOrder, HypothesisPhase, HypothesisState } from './model.js';
import type { Issue } from '../../core/errors.js';
import type { QueryParams } from '../../core/http/index.js';
import type { PageParams } from '../pagination.js';

/** Every filter takes several values and matches any of them. */
export type ListHypothesesParams = PageParams & {
    flowIds?: readonly string[] | undefined;
    /** By default the rows that need attention come first, then the backlog order. */
    orderBy?: HypothesisOrder | undefined;
    parentHypothesisIds?: readonly string[] | undefined;
    phases?: readonly HypothesisPhase[] | undefined;
    /** Also brings the rows of other placements whose flow is served here, marked `is_projected`. */
    placementIds?: readonly string[] | undefined;
    segmentIds?: readonly string[] | undefined;
    states?: readonly HypothesisState[] | undefined;
    types?: readonly string[] | undefined;
    variantFlowIds?: readonly string[] | undefined;
};

/** The server reads one comma separated value per filter; a repeated parameter keeps only the last. */
const joined = (values: readonly string[] | undefined): string | undefined =>
    (values === undefined || values.length === 0 ? undefined : values.join(','));

/** A value is one item of a comma separated list, so it holds no comma and is not empty. */
export const validateList = (params: ListHypothesesParams | undefined): Issue[] => {
    const filters: [string, readonly string[] | undefined][] = [
        ['flowIds', params?.flowIds],
        ['parentHypothesisIds', params?.parentHypothesisIds],
        ['phases', params?.phases],
        ['placementIds', params?.placementIds],
        ['segmentIds', params?.segmentIds],
        ['states', params?.states],
        ['types', params?.types],
        ['variantFlowIds', params?.variantFlowIds],
    ];

    return filters.flatMap(([path, values]) => (values ?? [])
        .filter(value => value.trim() === '' || value.includes(','))
        .map(value => ({ message: `"${value}" must be one value, without a comma`, path })));
};

export const listQuery = (params: ListHypothesesParams | undefined): QueryParams => ({
    ...pageQuery(params),
    'filter[flow_id]': joined(params?.flowIds),
    'filter[parent_hypothesis_id]': joined(params?.parentHypothesisIds),
    'filter[phase]': joined(params?.phases),
    'filter[placement_id]': joined(params?.placementIds),
    'filter[segment_id]': joined(params?.segmentIds),
    'filter[state]': joined(params?.states),
    'filter[type]': joined(params?.types),
    'filter[variant_flow_id]': joined(params?.variantFlowIds),
    'order_by': params?.orderBy,
});
