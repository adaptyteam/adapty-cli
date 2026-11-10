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
