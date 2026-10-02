import type { Issue } from '../../core/errors.js';

/** Pass the revision you read; the server rejects stale revisions with 409 revision_conflict. */
export type RunActionInput = {
    expectedRevision: number;
    input?: unknown;
};

type RunActionRequest = {
    expected_revision: number;
    input: Record<string, unknown>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** Validate the input shape locally; the server validates its fields against the action schema. */
export const validateActionInput = (input: unknown): Issue[] => {
    if (input === undefined || isPlainObject(input)) {
        return [];
    }

    return [{ message: 'must be a JSON object', path: 'input' }];
};

/** Omitted input is sent as an empty object. */
export const toRunActionRequest = ({ expectedRevision, input }: RunActionInput): RunActionRequest => {
    return {
        expected_revision: expectedRevision,
        input: isPlainObject(input) ? input : {},
    };
};
