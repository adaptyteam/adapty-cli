// Shared "how to fix a flow" links, used by `flows publish` (config-error message)
// and by `placements create`/`update` (draft-attach error). One source for both URLs.

import { ApiError } from './errors.js';

export function builderUrl(flowId: string): string {
    return `https://app.adapty.io/flows/${flowId}/builder`;
}

/** The two "• …" footer lines pointing at the Builder UI and the flows agent skill. */
export function flowFixLinks(flowId: string): string {
    return `  • Builder UI: ${builderUrl(flowId)}\n  • Adapty flows agent skill: https://adapty.io/docs/flow-generator-skill`;
}

// The backend message when a placement tries to attach an unpublished flow. There is no
// distinct error_code (it comes back as generic validation_error), so match on the text.
const DRAFT_FLOW_MARKER = 'Flow must be published before placing in a placement';

/**
 * When `error` is the backend's draft-flow rejection, returns an enriched message with the
 * publish command and fix links; otherwise returns null so the caller rethrows unchanged.
 * `flowId` is taken from the single flow audience, or `<FLOW_ID>` when it is ambiguous.
 */
export function draftFlowError(
    error: unknown,
    app: string,
    audiences: null | { content_type?: string; flow_id?: string }[],
): null | string {
    if (!(error instanceof ApiError) || !error.message.includes(DRAFT_FLOW_MARKER)) {
        return null;
    }

    const flowIds = (audiences ?? [])
        .filter(a => a.content_type === 'flow')
        .map(a => a.flow_id)
        .filter((id): id is string => typeof id === 'string');

    const onlyFlowId = flowIds.length === 1 ? flowIds[0] : undefined;
    const flowId = onlyFlowId ?? '<FLOW_ID>';

    return (
        'Cannot attach a draft flow to a placement — publish it first.\n'
        + `Publish:  adapty flows publish --app ${app} ${flowId}\n`
        + flowFixLinks(flowId)
    );
}

/**
 * Human view of a `FlowConfigDTO`: the scalar fields, plus a one-line summary standing in for the
 * opaque `config` blob (and for `remote_configs`). Builder configs reach tens of megabytes, so
 * rendering them line by line is unreadable and used to overflow the stack; `--json` still
 * returns the full payload.
 */
export function summarizeFlowConfig(
    result: { config: Record<string, unknown>; remote_configs?: unknown[] } & Record<string, unknown>,
): Record<string, unknown> {
    const { config, remote_configs: remoteConfigs, ...scalars } = result;
    const bytes = Buffer.byteLength(JSON.stringify(config), 'utf8');
    const screens = Array.isArray(config.screens) ? `${config.screens.length} screens, ` : '';
    const locales = Array.isArray(config.locales) ? `${config.locales.length} locales, ` : '';

    return {
        ...scalars,
        config: `${screens}${locales}${bytes} bytes (use --json for the full config)`,
        ...(Array.isArray(remoteConfigs) && remoteConfigs.length > 0
            ? { remote_configs: `${remoteConfigs.length} entries (use --json for the full payload)` }
            : {}),
    };
}
