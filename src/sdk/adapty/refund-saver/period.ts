import { pageQuery } from '../pagination.js';

import type { RefundStore } from './model.js';
import type { QueryParams } from '../../core/http/index.js';
import type { PageParams } from '../pagination.js';

/**
 * UTC days on the date a request was handled. The order of the two days is the server's business: a
 * reversed range is an empty answer there, not an error.
 */
export type RefundPeriodInput = {
    dateFrom: string;
    dateTo: string;
    store?: RefundStore | undefined;
};

export type ListRefundRequestsInput = PageParams & RefundPeriodInput;

export const periodQuery = (input: RefundPeriodInput): QueryParams =>
    ({ date_from: input.dateFrom, date_to: input.dateTo, store: input.store });

export const requestsQuery = (input: ListRefundRequestsInput): QueryParams =>
    ({ ...periodQuery(input), ...pageQuery(input) });
