/** The door of the hypotheses resource: re-exports only. */
export { validateAccept } from './accept.js';
export { validateCreate, withHypothesisIds } from './create.js';
export { dashboardOnlyActions, hypothesisOrders, hypothesisPhases, hypothesisResults, hypothesisStates } from './model.js';
export { hypotheses } from './resource.js';

export type { AcceptHypothesisInput, ProductFill } from './accept.js';
export type { CreatedHypotheses, CreatedHypothesis, CreateHypothesesInput, HypothesisCreateBody } from './create.js';
export type { ListHypothesesParams } from './list.js';
export type {
    Hypothesis,
    HypothesisOrder,
    HypothesisPhase,
    HypothesisPlacementSummary,
    HypothesisResult,
    HypothesisRows,
    HypothesisState,
    HypothesisSummary,
} from './model.js';
export type { BareHypothesisAction, HypothesesApi } from './resource.js';
