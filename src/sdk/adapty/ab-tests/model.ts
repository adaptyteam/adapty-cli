/**
 * What every operation of the resource shares: the entity as the server sends it, and the
 * vocabulary of types and states. Answers pass through exactly as they arrive, in snake_case — that
 * is what --json prints. An input shape lives in the file of the operation that takes it.
 *
 * Regular tests only: the paywall type and the flow type. Crossplacement and onboarding tests are
 * not served by this resource.
 */

export const abTestTypes = ['paywall', 'flow'] as const;
export type AbTestType = (typeof abTestTypes)[number];

/** In the order the server lists them when no state is asked for. */
export const abTestStates = ['live', 'draft', 'completed', 'inactive', 'archived'] as const;
export type AbTestState = (typeof abTestStates)[number];

export type AbTestPlacement = {
    placement_id: string;
    title: null | string;
};

export type AbTestSummary = {
    ab_test_id: string;
    /** `[]` is "All users", `null` is no audience at all (a draft that has none planned). */
    segment_ids: null | string[];
    /** The order of the running audience in its placement, 0 is first. `null` for a draft. */
    priority: null | number;
    placement: AbTestPlacement | null;
    started_at: null | string;
    stopped_at: null | string;
    /** Not the AbTestState union: the server owns this list and may grow it without asking us. */
    state: string;
    title: string;
    type: AbTestType;
};

export type PaywallArmView = {
    paywall_id: string;
    paywall_title: null | string;
    /** The arm's own title; without one the SDK of the app reports the content name. */
    title: null | string;
    /** The id of the arm that the app SDK reports. A new draft answers with `null` until it is read again. */
    variation_id: null | string;
    weight: number;
};

export type FlowArmView = {
    flow_id: string;
    flow_name: null | string;
    title: null | string;
    variation_id: null | string;
    weight: number;
};

/** What every operation except list answers with. */
export type AbTestDetail = AbTestSummary & {
    flows: FlowArmView[];
    goal: string;
    paywalls: PaywallArmView[];
};
