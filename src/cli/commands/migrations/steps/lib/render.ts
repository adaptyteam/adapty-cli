import type { Envelope, Step, StepStatus } from '../../../../../sdk/adapty/index.js';

/** Unknown statuses are displayed as text; satisfies checks that all known statuses have a mark. */
const marks: Record<string, string> = {
    active: '[>]',
    done: '[x]',
    locked: '[ ]',
} satisfies Record<StepStatus, string>;

const markOf = (status: string): string => marks[status] ?? `[${status}]`;

const maxWidth = (values: readonly string[]): number => {
    return values.reduce((max, value) => Math.max(max, value.length), 0);
};

type Widths = { mark: number; stepId: number };

const stepLine = (step: Step, widths: Widths): string => {
    const mark = markOf(step.status).padEnd(widths.mark);
    const stepId = step.step_id.padEnd(widths.stepId);
    const summary = step.summary === null ? '' : `  ${step.summary}`;

    return `${mark} ${stepId}  ${step.title}${summary}`;
};

/** Keep server order and step IDs so users can match steps to issues and actions. */
export const renderSteps = (envelope: Envelope): string => {
    const { steps } = envelope;

    if (steps.length === 0) {
        return `No steps yet: ${envelope.migration.summary}`;
    }

    const widths = {
        mark: maxWidth(steps.map(step => markOf(step.status))),
        stepId: maxWidth(steps.map(step => step.step_id)),
    };

    return steps.map(step => stepLine(step, widths)).join('\n');
};
