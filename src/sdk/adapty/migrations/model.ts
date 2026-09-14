export type MigrationState = 'running' | 'action_required' | 'completed' | 'failed' | 'canceled';
export type ActionKind = 'input' | 'upload' | 'external';
export type StepStatus = 'locked' | 'active' | 'done';

export type JsonSchema = Record<string, unknown>;

export type Envelope<TResult = unknown> = {
    migration: Migration;
    steps: Step[];
    issues: Issue[];
    next_actions: Action[];
    available_actions: Action[];
    resources: ResourceRef[];
    result: TResult | null;
};

export type MigrationList = {
    items: Migration[];
    available: AvailableFlow[];
};

export type AvailableFlow = {
    flow: string;
    title: string;
    detail: string | null;
    app: { id: string; name: string };
};

export type Migration = {
    id: string;
    flow: string;
    revision: number;
    state: MigrationState;
    app: { id: string; name: string } | null;
    poll_after_seconds: number;
    progress: Progress | null;
    summary: string;
    created_at: string;
    updated_at: string;
};

export type Progress = {
    done: number;
    total: number | null;
    unit: string;
};

export type Step = {
    step_id: string;
    title: string;
    status: StepStatus;
    summary: string | null;
};

export type Issue = {
    code: string;
    title: string;
    detail: string | null;
    step_id: string | null;
    action_id: string | null;
};

type ActionBase = {
    action_id: string;
    step_id: string;
    title: string;
    detail: string | null;
    reads: string[];
    confirm: string | null;
};

export type Action = ActionBase & (
    | { kind: 'input'; input_schema: JsonSchema | null }
    | { kind: 'upload' }
    | { kind: 'external'; href: string }
    // A newer WS may send a kind this build does not know; href is kept so it can still be shown
    | { kind: string; href?: string }
);

export type ResourceRef = { name: string; title: string };

export type WizardError = {
    error: {
        code: string;
        message: string;
        detail: string | null;
        next_step: string | null;
        retryable: boolean;
        retry_after_seconds: number | null;
        fields: { path: string; message: string }[];
        request_id: string;
    };
};
