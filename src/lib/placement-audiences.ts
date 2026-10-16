// Runtime guard for --audiences entries parsed from user/agent-supplied JSON.
// The DTO union in api-schemas.ts requires content_type, but a JSON.parse gives
// back `unknown`, so the type alone cannot enforce it — this does, the same way
// for humans and agents (no prompting).

/** The A/B test audience kinds: regular and crossplacement, paywall and flow. Each needs `ab_test_id`. */
const A_B_TEST_KINDS = new Set(['ab_test', 'cross_ab_test', 'flow_ab_test', 'flow_cross_ab_test']);

/**
 * Returns a human-readable problem string when `entry` is not a valid placement
 * audience entry, or `null` when it is well-formed. Every entry must carry an
 * explicit `content_type`; there is no implicit paywall. A kind that this CLI does
 * not know is refused with an "update the CLI" text, never with a text that invites
 * deleting the entry: a write without a running A/B test entry stops that test.
 */
export function audienceEntryProblem(entry: unknown): null | string {
    if (typeof entry !== 'object' || entry === null) {
        return 'each entry must be a JSON object';
    }

    const {
        ab_test_id: abTestId,
        content_type: contentType,
        flow_id: flowId,
        paywall_id: paywallId,
    } = entry as Record<string, unknown>;

    if (typeof contentType !== 'string') {
        return 'content_type is required: "paywall", "flow", "ab_test", "flow_ab_test", "cross_ab_test" or "flow_cross_ab_test"';
    }

    if (contentType === 'paywall') {
        return typeof paywallId === 'string' ? null : 'a paywall entry requires paywall_id';
    }

    if (contentType === 'flow') {
        return typeof flowId === 'string' ? null : 'a flow entry requires flow_id';
    }

    if (!A_B_TEST_KINDS.has(contentType)) {
        return 'this CLI does not know this audience kind; update the CLI';
    }

    return typeof abTestId === 'string' ? null : `an entry with content_type "${contentType}" requires ab_test_id`;
}
