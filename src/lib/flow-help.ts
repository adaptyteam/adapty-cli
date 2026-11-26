// The draft-flow refusal of `placements create`/`update`, with the "how to fix a flow" links: one view of the
// new stack, shared with the refused `flows publish`.

import { flowFixLinks } from '../cli/views/flow-links.js';

import { ApiError } from './errors.js';

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
