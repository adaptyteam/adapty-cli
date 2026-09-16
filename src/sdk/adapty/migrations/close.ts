import type { Issue } from '../../core/errors.js';

/** Both outcomes permanently close the migration. */
export type CloseOutcome = 'cancel' | 'finish';

/** Accept strings so invalid outcomes produce a validation error for any caller. */
export type CloseMigrationInput = {
    expectedRevision: number;
    outcome: string;
};

type CloseMigrationRequest = {
    expected_revision: number;
    outcome: string;
};

const OUTCOMES = new Set<string>(['cancel', 'finish'] satisfies CloseOutcome[]);

export const validateCloseMigration = ({ outcome }: CloseMigrationInput): Issue[] =>
    (OUTCOMES.has(outcome) ? [] : [{ message: 'must be `finish` or `cancel`', path: 'outcome' }]);

/** The server rejects a stale revision with 409. */
export const toCloseRequest = ({ expectedRevision, outcome }: CloseMigrationInput): CloseMigrationRequest => ({
    expected_revision: expectedRevision,
    outcome,
});
