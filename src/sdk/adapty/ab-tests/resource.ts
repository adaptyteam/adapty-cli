import { assertValid } from '../../core/validation.js';

import { listQuery } from './list.js';
import { toStartRequest, validateStart } from './start.js';
import { toStopRequest, validateStop } from './stop.js';
import { toWriteRequest, validateWrite } from './write.js';

import type { ListAbTestsParams } from './list.js';
import type { AbTestDetail, AbTestSummary } from './model.js';
import type { StartAbTestInput } from './start.js';
import type { StopAbTestInput } from './stop.js';
import type { AbTestWriteInput } from './write.js';
import type { Http } from '../../core/http/index.js';
import type { Paginated } from '../pagination.js';

/**
 * Every path of the A/B tests resource in one place. The four actions that change what real users
 * see — start, stop, replace and archive — are the calls that cannot be undone: asking before them
 * is the adapter's business, not the resource's.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise,
 * like a network failure, and one await covers both.
 */
export const abTests = (http: Http) => {
    const base = (appId: string): string => `/apps/${appId}/ab-tests`;

    return {
        get: (appId: string, abTestId: string) => http.get<AbTestDetail>(`${base(appId)}/${abTestId}`),
        list: (appId: string, params?: ListAbTestsParams) =>
            http.get<Paginated<AbTestSummary>>(base(appId), { query: listQuery(params) }),

        /** The test read back, in state `archived`. A live test is refused by the server. */
        archive: (appId: string, abTestId: string) => http.delete<AbTestDetail>(`${base(appId)}/${abTestId}`),

        create: async (appId: string, input: AbTestWriteInput): Promise<AbTestDetail> => {
            assertValid(validateWrite(input));

            return http.post<AbTestDetail>(base(appId), toWriteRequest(input));
        },

        /** The new test, with a new id; the old one is completed. A placement is required. */
        replace: async (appId: string, abTestId: string, input: Omit<AbTestWriteInput, 'segmentIds'>): Promise<AbTestDetail> => {
            assertValid(validateWrite(input, { placementRequired: true }));

            return http.post<AbTestDetail>(`${base(appId)}/${abTestId}/replace`, toWriteRequest(input));
        },

        start: async (appId: string, abTestId: string, input: StartAbTestInput): Promise<AbTestDetail> => {
            assertValid(validateStart(input));

            return http.post<AbTestDetail>(`${base(appId)}/${abTestId}/start`, toStartRequest(input));
        },

        /** The test read back, in state `completed`. */
        stop: async (appId: string, abTestId: string, input: StopAbTestInput = {}): Promise<AbTestDetail> => {
            assertValid(validateStop(input));

            return http.post<AbTestDetail>(`${base(appId)}/${abTestId}/stop`, toStopRequest(input));
        },

        update: async (appId: string, abTestId: string, input: AbTestWriteInput): Promise<AbTestDetail> => {
            assertValid(validateWrite(input));

            return http.put<AbTestDetail>(`${base(appId)}/${abTestId}`, toWriteRequest(input));
        },
    };
};

export type AbTestsApi = ReturnType<typeof abTests>;
