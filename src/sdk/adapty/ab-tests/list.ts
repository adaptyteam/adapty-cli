import { pageQuery } from '../pagination.js';

import type { AbTestState, AbTestType } from './model.js';
import type { QueryParams } from '../../core/http/index.js';
import type { PageParams } from '../pagination.js';

export type ListAbTestsParams = PageParams & {
    /** One or more placements: the server takes the ids comma separated and matches any of them. */
    placementIds?: readonly string[] | undefined;
    search?: string | undefined;
    /** One or more segments: the tests whose audience is exactly that segment, any of them. */
    segmentIds?: readonly string[] | undefined;
    /** Without a state the list has all of them. */
    state?: AbTestState | undefined;
    /** One call reads one type; the server's default is `flow`, so a caller that wants paywalls says so. */
    type?: AbTestType | undefined;
};

/** An empty list is no filter. */
const joined = (ids: readonly string[] | undefined): string | undefined =>
    (ids === undefined || ids.length === 0 ? undefined : ids.join(','));

/** Camel case in, the server's names on the wire; an unset parameter is left out. */
export const listQuery = (params: ListAbTestsParams | undefined): QueryParams => ({
    ...pageQuery(params),
    'filter[placement_id]': joined(params?.placementIds),
    'filter[search]': params?.search,
    'filter[segment_id]': joined(params?.segmentIds),
    'filter[state]': params?.state,
    'type': params?.type,
});
