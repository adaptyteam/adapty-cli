/**
 * The door of the migrations resource: re-exports only, no code of its own. Everything outside
 * the directory imports from here, which is what lets the files behind it be rearranged.
 */
export { migrations } from './resource.js';

export type { MigrationApi } from './resource.js';
export type {
    Action,
    ActionKind,
    AvailableFlow,
    Envelope,
    Issue,
    JsonSchema,
    Migration,
    MigrationList,
    MigrationState,
    Progress,
    ResourceRef,
    Step,
    StepStatus,
    WizardError,
} from './model.js';
