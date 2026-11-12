/**
 * The hypothesis as the server sends it, and the vocabularies the list filters and the verdicts take.
 * Answers pass through in snake_case: that object is what --json prints.
 */

export const hypothesisStates = ['proposed', 'accepted', 'dismissed', 'won', 'lost', 'inconclusive'] as const;
export type HypothesisState = (typeof hypothesisStates)[number];

/** The state, except that an accepted row follows its A/B test or its applied audience. */
export const hypothesisPhases = [
    'proposed',
    'accepted',
    'test_draft',
    'testing',
    'ended',
    'applied',
    'dismissed',
    'won',
    'lost',
    'inconclusive',
] as const;
export type HypothesisPhase = (typeof hypothesisPhases)[number];

export const hypothesisResults = ['won', 'lost', 'inconclusive'] as const;
export type HypothesisResult = (typeof hypothesisResults)[number];

export const hypothesisOrders = ['position', 'created_at', '-created_at', '-resolved_at'] as const;
export type HypothesisOrder = (typeof hypothesisOrders)[number];

/** `reorder` is the dashboard's: the Developer API has no route for it. */
export const dashboardOnlyActions: readonly string[] = ['reorder'];

export type HypothesisRef = {
    id: string;
    is_removed: boolean;
    title: null | string;
};

export type HypothesisSubject = {
    country_code: null | string;
    flow_id: null | string;
    flow_screen_id: null | string;
    flow_version_id: null | string;
    is_removed: boolean;
    paywall_id: null | string;
    segment_id: null | string;
    title: null | string;
    /** `flow`, `flow_screen`, `audience`, or `paywall` on a legacy row. */
    type: string;
};

export type HypothesisAbTest = {
    id: string;
    is_removed: boolean;
    parent_ab_test_id: null | string;
    started_at: null | string;
    state: string;
    stopped_at: null | string;
    type: string;
    winner_flow_id: null | string;
};

export type HypothesisExpected = {
    evidence_text: null | string;
    high_pct: null | number;
    low_pct: null | number;
    metric: null | string;
};

export type HypothesisProduct = {
    [field: string]: unknown;
    country: null | string;
    currency: null | string;
    current_local_price: null | number;
    duration_type: string;
    hypothesis_product_id: string;
    is_exist: boolean;
    position: number;
    price: null | number;
    product: HypothesisRef | null;
    product_id: null | string;
    store_product_id: null | string;
    trial_duration: null | number;
};

/**
 * State, phase and the vocabularies are strings rather than the unions above: the server owns those
 * lists and may grow them without asking us.
 */
export type Hypothesis = {
    [field: string]: unknown;
    ab_test: HypothesisAbTest | null;
    ab_test_id: null | string;
    action: null | string;
    /** The actions the server accepts for this row right now. */
    allowed_actions: string[];
    app_id: string;
    created_at: string;
    examples: string[];
    expected: HypothesisExpected | null;
    hypothesis_id: string;
    is_legacy: boolean;
    /** A row of another placement whose flow is served on the placement the list was filtered by. */
    is_projected: boolean;
    judged_by: null | string;
    media_url: null | string;
    metrics_impact: string[];
    outcome: (HypothesisRef & { kind: string }) | null;
    parent_hypothesis_id: null | string;
    phase: string;
    placement: HypothesisRef;
    placement_audience_id: null | string;
    placement_id: string;
    products: HypothesisProduct[];
    rationale: null | string;
    resolved_at: null | string;
    source: string;
    stale: string;
    state: string;
    subject: HypothesisSubject;
    /** What the linked test's winner says, while the row waits for the user to confirm it. */
    suggested_result: null | string;
    title: string;
    type: string;
    variant_flow_id: null | string;
};

export type HypothesisPlacementSummary = {
    accepted_by_phase: Record<string, number>;
    attention_count: number;
    legacy_count: number;
    placement_id: string;
    projected_count: number;
    proposed: number;
};

export type HypothesisSummary = {
    data: HypothesisPlacementSummary[];
};

export type HypothesisRows = {
    data: Hypothesis[];
};
