import type { Paginated } from './pagination.js';
import type { Http, QueryParams } from '../core/http/index.js';

/**
 * The version history of a flow: the draft, the live version and the versions before them, as the
 * history panel of the flow builder shows them. The server owns the roles: `live` is the published
 * version, `draft` the current version while it is not published (also while it publishes or after a
 * failed publish), `previous` every other one. A flow has one draft or none.
 */

export type FlowVersionState = 'draft' | 'live' | 'previous';

/** One row of the history, newest first. */
export type FlowVersionRow = {
    created_at: string;
    flow_version_id: string;
    is_current: boolean;
    /** Who changed the content last, as the dashboard names them; null when nobody is known. */
    last_edited_by: null | string;
    /** Null until somebody names the version; `title` is then "Version N". */
    name: null | string;
    publication_status: null | string;
    /** Null when the version never started a publish. */
    published_at: null | string;
    state: FlowVersionState;
    title: string;
    /** The content time in milliseconds: the token a restore that replaces this draft sends back. */
    updated_at: number;
    version: number;
};

/**
 * One version with all its content: the configs, every layout, the remote configs and the paywalls.
 * The content keys are the server's; the CLI passes them through as they come.
 */
export type FlowVersionDetail = FlowVersionRow & {
    [content: string]: unknown;
    /** The link that opens this version in the Adapty app on a test device. */
    preview_url: string;
};

/** What a test device needs of a version: its id and the link that opens it. */
export type FlowVersionPreview = Pick<FlowVersionDetail, 'flow_version_id' | 'preview_url'>;

export type ListFlowVersionsParams = {
    /** Part of a title, any case; spaces at the ends do not count. The server filters. */
    search?: string | undefined;
};

export type RestoreFlowVersionInput = {
    /** The `updated_at` of the draft the restore replaces. */
    expectedUpdatedAt: number;
};

/** The draft of a history, when there is one. */
export const findDraft = (rows: readonly FlowVersionRow[]): FlowVersionRow | undefined =>
    rows.find(row => row.state === 'draft');

/** Until the first publish the history has only the draft (or nothing at all). */
export const hasPublishedHistory = (rows: readonly FlowVersionRow[]): boolean =>
    rows.some(row => row.state !== 'draft');

/** Every step between the start of a publish and its end, as the server reports it. */
const PUBLISHING_STATUSES = new Set([
    'adding_variations',
    'publishing',
    'transformed',
    'transforming',
    'uploaded',
    'uploading',
    'variations_added',
]);

/** Where the publish of a row stands. Only a draft is ever publishing or failed. */
export const versionPublication = (row: FlowVersionRow): 'failed' | 'publishing' | undefined => {
    if (row.state !== 'draft' || row.publication_status === null) {
        return undefined;
    }

    if (row.publication_status === 'failed') {
        return 'failed';
    }

    return PUBLISHING_STATUSES.has(row.publication_status) ? 'publishing' : undefined;
};

/**
 * The date of a row: a draft is dated by its creation, because the time of a failed publish is not
 * when it was made; a live or previous version by its publish, else by its creation.
 */
export const versionDate = (row: FlowVersionRow): string =>
    (row.state === 'draft' ? row.created_at : row.published_at ?? row.created_at);

/** An empty name, or spaces only, gives the version its "Version N" title again. */
export const renameRequest = (name: null | string): { name: null | string } =>
    ({ name: name === null || name.trim() === '' ? null : name });

/** No draft: nothing to confirm. A draft: the confirmation and the token of the draft it replaces. */
export const restoreRequest = (input?: RestoreFlowVersionInput): Record<string, unknown> =>
    (input === undefined ? {} : { expected_updated_at: input.expectedUpdatedAt, replace_draft: true });

const listQuery = (params: ListFlowVersionsParams | undefined): QueryParams => {
    const search = params?.search?.trim();

    return { 'filter[search]': search === undefined || search === '' ? undefined : search };
};

/**
 * Every path of the history of one flow. Restore and duplicate are writes that are never retried:
 * a second restore would replace the draft again, a second duplicate would make a second flow.
 * Asking before a restore that replaces a draft is the adapter's business.
 */
export const flowVersions = (http: Http, base: (appId: string, flowId: string) => string) => {
    const get = (appId: string, flowId: string, versionId: string) =>
        http.get<FlowVersionDetail>(`${base(appId, flowId)}/versions/${versionId}`);

    return {
        get,

        /** Without a page size the server gives every row. */
        list: (appId: string, flowId: string, params?: ListFlowVersionsParams) =>
            http.get<Paginated<FlowVersionRow>>(`${base(appId, flowId)}/versions`, { query: listQuery(params) }),

        rename: (appId: string, flowId: string, versionId: string, name: null | string) =>
            http.patch<FlowVersionRow>(`${base(appId, flowId)}/versions/${versionId}`, renameRequest(name)),

        /** Without input the flow must have no draft: the server refuses to replace one silently. */
        restore: (appId: string, flowId: string, versionId: string, input?: RestoreFlowVersionInput) =>
            http.post<FlowVersionDetail>(`${base(appId, flowId)}/versions/${versionId}/restore`, restoreRequest(input)),

        /** The version read for its test-device link alone. */
        preview: async (appId: string, flowId: string, versionId: string): Promise<FlowVersionPreview> => {
            const version = await get(appId, flowId, versionId);

            return { flow_version_id: version.flow_version_id, preview_url: version.preview_url };
        },
    };
};
