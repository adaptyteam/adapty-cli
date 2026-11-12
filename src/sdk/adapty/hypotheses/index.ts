/** The door of the hypotheses resource: re-exports only. */
export { withHypothesisIds } from './create.js';
export { dashboardOnlyActions } from './model.js';
export { hypotheses } from './resource.js';

export type { AcceptHypothesisInput, ProductFill } from './accept.js';
export type { CreatedHypotheses, CreateHypothesesInput, HypothesisCreateBody } from './create.js';
export type { ListHypothesesParams } from './list.js';
export type {
    Hypothesis,
    HypothesisRows,
    HypothesisSummary,
} from './model.js';
export type { HypothesesApi } from './resource.js';
