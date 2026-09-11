import type { QueryParams } from '../core/http/index.js';

/**
 * The paginated answer, and the query that asks for a page. Product and not core: `meta.pagination`
 * and the bracketed `page[...]` names are this API's convention, not the transport's business. ASA
 * follows the same convention today, so sdk/asa can import this until the two actually diverge.
 */
export type Pagination = {
    count: number;
    page: number;
    pages: number;
};

export type Paginated<T> = {
    data: T[];
    meta: {
        pagination: Pagination;
    };
};

/** Page selection as we take it: camelCase in, the server's names on the wire. */
export type PageParams = {
    page?: number | undefined;
    pageSize?: number | undefined;
};

export const pageQuery = (params: PageParams | undefined): QueryParams =>
    ({ 'page[number]': params?.page, 'page[size]': params?.pageSize });
