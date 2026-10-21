import { pageQuery } from '../pagination.js';

import type { AbTestState, AbTestType } from './model.js';
import type { QueryParams } from '../../core/http/index.js';
import type { PageParams } from '../pagination.js';

export type ListAbTestsParams = PageParams & {
    placementId?: string | undefined;
    search?: string | undefined;
    /** Without a state the list has all of them. */
    state?: AbTestState | undefined;
    /** One call reads one type; the server's default is `flow`, so a caller that wants paywalls says so. */
    type?: AbTestType | undefined;
};

/** Camel case in, the server's names on the wire; an unset parameter is left out. */
export const listQuery = (params: ListAbTestsParams | undefined): QueryParams => ({
    ...pageQuery(params),
    'filter[placement_id]': params?.placementId,
    'filter[search]': params?.search,
    'filter[state]': params?.state,
    'type': params?.type,
});
