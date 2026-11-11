import { assertValid } from '../core/validation.js';

import { toFlowFunnelRequest } from './flow-funnel.js';
import { flowVersions } from './flow-versions.js';
import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from './metrics.js';

import type { FlowFunnelAnswer, FlowFunnelInput } from './flow-funnel.js';
import type { FilterValues, FlowMetricsRows, MetricsInput, MetricsTree } from './metrics.js';
import type { Http } from '../core/http/index.js';

/** A flow as the developer API gives it. */
export type Flow = {
    id: string;
    name: string;
    /** Null when the flow was never published. */
    published_flow_version_id?: null | string;
    status?: string;
    updated_at?: string;
};

/** A flow that has no live version and never had one. An older server that does not send the field says nothing. */
export const isNeverPublished = (flow: Flow): boolean => flow.published_flow_version_id === null;

/** How many flow reads of one `neverPublished` call are in flight at most: a long id list stays polite. */
export const FLOW_READ_LIMIT = 5;

/**
 * `Promise.allSettled` with at most `limit` tasks in flight: each worker takes the next item when its
 * task settles. The results keep the order of the items.
 */
const settleLimited = async <T, R>(
    items: readonly T[],
    limit: number,
    task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
    const results: PromiseSettledResult<R>[] = [];
    let next = 0;

    const worker = async (): Promise<void> => {
        for (let index = next++; index < items.length; index = next++) {
            try {
                results[index] = { status: 'fulfilled', value: await task(items[index] as T) };
            } catch (reason) {
                results[index] = { reason, status: 'rejected' };
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

    return results;
};

/**
 * The flows of an app. The read of one flow, the duplicate, the version history, the metrics and the
 * screen funnel are here: the other flow operations still live in the old stack and move here when
 * the topic is ported.
 *
 * Metrics and the funnel are reads, though `get` is a POST: the body only describes the question.
 * Like the other analytics queries (`attribution report`) it is never retried: it is heavy, and a
 * 429 (the routes are rate limited per app) leaves the server's `Retry-After` on the error for the
 * caller. What a metrics `get` takes lives in `metrics.ts`, what a funnel `get` takes in
 * `flow-funnel.ts`.
 */
export const flows = (http: Http) => ({
    /**
     * A new flow, "<name>_copy", with one unpublished draft: the content of the given version, else
     * of the current one (the draft, else the live version). The source flow does not change.
     */
    duplicate: (appId: string, flowId: string, versionId?: string) =>
        http.post<Flow>(`/apps/${appId}/flows/${flowId}/copy`, versionId === undefined ? {} : { flow_version_id: versionId }),

    get: (appId: string, flowId: string) => http.get<Flow>(`/apps/${appId}/flows/${flowId}`),

    /**
     * Which of these flows were never published, read in parallel, at most `FLOW_READ_LIMIT` at a time.
     * A flow that cannot be read is not known to be unpublished: it is left out, and the read failure
     * is not the caller's problem.
     */
    neverPublished: async (appId: string, flowIds: readonly string[]): Promise<Set<string>> => {
        const reads = await settleLimited(flowIds, FLOW_READ_LIMIT, flowId => http.get<Flow>(`/apps/${appId}/flows/${flowId}`));

        return new Set(flowIds.filter((_, index) => {
            const read = reads[index];

            return read?.status === 'fulfilled' && isNeverPublished(read.value);
        }));
    },

    versions: flowVersions(http, (appId, flowId) => `/apps/${appId}/flows/${flowId}`),

    funnel: {
        /** The dashboard's CSV of the same funnel, as text: the server writes it, the CLI adds nothing. */
        csv: (appId: string, flowId: string, input: FlowFunnelInput): Promise<string> =>
            http.post<string>(`/apps/${appId}/flows/${flowId}/screen-funnel`, toFlowFunnelRequest(input), {
                headers: { accept: 'text/csv', ...timezoneHeaders(input.timezone) },
                idempotent: false,
                query: { format: 'csv' },
            }),

        get: (appId: string, flowId: string, input: FlowFunnelInput): Promise<FlowFunnelAnswer> =>
            http.post<FlowFunnelAnswer>(`/apps/${appId}/flows/${flowId}/screen-funnel`, toFlowFunnelRequest(input), {
                headers: timezoneHeaders(input.timezone),
                idempotent: false,
            }),

        values: (appId: string, flowId: string) =>
            http.get<FilterValues>(`/apps/${appId}/flows/${flowId}/screen-funnel/values`),
    },

    metrics: {
        get: async (appId: string, flowId: string, input: MetricsInput): Promise<MetricsTree> => {
            assertValid(validateMetricsInput(input));

            return http.post<MetricsTree>(`/apps/${appId}/flows/${flowId}/metrics`, toMetricsRequest(input), {
                headers: timezoneHeaders(input.timezone),
                idempotent: false,
            });
        },

        list: (appId: string, flowIds: readonly string[]) =>
            http.get<FlowMetricsRows>(`/apps/${appId}/flows/metrics`, { query: { 'filter[flow_id]': flowIds.join(',') } }),

        values: (appId: string, flowId: string) => http.get<FilterValues>(`/apps/${appId}/flows/${flowId}/metrics/values`),
    },
});

export type FlowsApi = ReturnType<typeof flows>;
