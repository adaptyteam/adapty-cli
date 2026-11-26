import { ApiError } from '../core/errors.js';
import { assertValid } from '../core/validation.js';

import { toFlowFunnelRequest } from './flow-funnel.js';
import { MEDIA_HEAD_BYTES, mediaExtension, validateVideoUpload, videoMimeTypes } from './flow-media.js';
import { flowVersions } from './flow-versions.js';
import { timezoneHeaders, toMetricsRequest, validateMetricsInput } from './metrics.js';

import type { FlowFunnelAnswer, FlowFunnelInput } from './flow-funnel.js';
import type { FlowVideo, FlowVideoUpload } from './flow-media.js';
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

export type FlowRemoteConfig = {
    data: string;
    locale: string;
};

/** The builder config of a flow, with the remote configs that are written together with it. */
export type FlowConfig = {
    config: Record<string, unknown>;
    publication_error?: null | string;
    publication_status?: string;
    remote_configs: FlowRemoteConfig[];
    status: string;
    transform_error?: null | string;
    /** Milliseconds: the token a write sends back as `expected_updated_at`. */
    updated_at: number;
};

export type WriteFlowConfigInput = {
    config: Record<string, unknown>;
    /** The write fails when the config changed after this read. */
    expectedUpdatedAt: number;
    /** A write replaces the whole list: the stored one is sent back to keep it. */
    remoteConfigs: FlowRemoteConfig[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const malformed = (answer: unknown, message: string): ApiError =>
    new ApiError({ code: 'malformed_response', details: answer, message, status: 200 });

/**
 * The transport hands back whatever a success body parsed to: a proxy's HTML page is a string. A config
 * answer is an object with the config object and the lock (`updated_at`, an integer), or an error: a caller
 * saves what it read and sends the lock back, and a save that answers anything else may or may not be done.
 */
const configAnswer = async (pending: Promise<unknown>): Promise<FlowConfig> => {
    const answer = await pending;

    if (!isRecord(answer)) {
        throw malformed(answer, 'The flow config answer is not a JSON object.');
    }

    const missing = [...(isRecord(answer.config) ? [] : ['config']), ...(Number.isInteger(answer.updated_at) ? [] : ['updated_at'])];

    if (missing.length > 0) {
        throw malformed(answer, `The flow config answer has no ${missing.join(', ')}.`);
    }

    return answer as FlowConfig;
};

/**
 * A write replaces the whole remote config list, so a read without it cannot be written back: the write
 * would drop the remote configs.
 */
export const requireWritableConfig = (stored: FlowConfig): void => {
    if (!Array.isArray((stored as Partial<FlowConfig>).remote_configs)) {
        throw malformed(stored, 'The flow config answer has no remote_configs.');
    }
};

/** A flow with no config version yet, as reported by the Developer API config read. */
export const isMissingFlowConfig = (error: unknown): boolean => error instanceof ApiError
    && error.status === 404
    && error.code === 'validation_error'
    && error.message === 'Flow version does not exist.';

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
 * The flows of an app. The read of one flow, the config read and write, the publish, the duplicate, the version
 * history, the metrics and the
 * screen funnel are here: the other flow operations still live in the old stack and move here when
 * the topic is ported.
 *
 * Metrics and the funnel are reads, though `get` is a POST: the body only describes the question.
 * Like the other analytics queries (`attribution report`) it is never retried: it is heavy, and a
 * 429 (the routes are rate limited per app) leaves the server's `Retry-After` on the error for the
 * caller. What a metrics `get` takes lives in `metrics.ts`, what a funnel `get` takes in
 * `flow-funnel.ts`.
 *
 * A media upload is a POST of one multipart field, `file`, and is never retried: a video upload
 * transcodes the file in the request. What it takes lives in `flow-media.ts`.
 */
export const flows = (http: Http) => ({
    config: {
        /** The server reports a missing flow version until the config is written for the first time. */
        get: (appId: string, flowId: string) => configAnswer(http.get(`/apps/${appId}/flows/${flowId}/config`)),

        /** An answer that is not the config envelope is `malformed_response`: the save may or may not be done. */
        update: (appId: string, flowId: string, input: WriteFlowConfigInput) =>
            configAnswer(http.put(`/apps/${appId}/flows/${flowId}/config`, {
                config: input.config,
                expected_updated_at: input.expectedUpdatedAt,
                remote_configs: input.remoteConfigs,
            }, { idempotent: false })),
    },

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

    /** Starts the publish and answers at once: the flow is `publishing`, the end shows on the flow. */
    publish: (appId: string, flowId: string) => http.post<Flow>(`/apps/${appId}/flows/${flowId}/publish`, undefined, { idempotent: false }),

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

    media: {
        uploadVideo: async (appId: string, file: FlowVideoUpload): Promise<FlowVideo> => {
            const head = file.content.subarray(0, MEDIA_HEAD_BYTES);

            assertValid(validateVideoUpload({ head, name: file.name, size: file.content.byteLength }));

            const form = new FormData();
            const type = videoMimeTypes[mediaExtension(file.name)];

            form.append('file', new Blob([new Uint8Array(file.content)], { type }), file.name);

            return http.post<FlowVideo>(`/apps/${appId}/flows/media/videos`, form, { idempotent: false });
        },
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
