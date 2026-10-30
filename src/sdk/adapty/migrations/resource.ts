import { randomUUID } from 'node:crypto';

import { pollUntil } from '../../core/poll.js';
import { assertValid } from '../../core/validation.js';

import { toRunActionRequest, validateActionInput } from './action.js';
import { toCloseRequest, validateCloseMigration } from './close.js';
import { toCreateRequest, validateCreateMigration } from './create.js';
import { hasMoved, pollDelayMs } from './wait.js';

import type { RunActionInput } from './action.js';
import type { CloseMigrationInput } from './close.js';
import type { CreateMigrationInput } from './create.js';
import type { Envelope, MigrationList } from './model.js';
import type { Clock } from '../../core/clock.js';
import type { Http, RequestOptions } from '../../core/http/index.js';
import type { WaitOptions } from '../../core/poll.js';

/** Reuse one idempotency key across retries to avoid applying the same write twice. */
const write = (): RequestOptions => ({
    headers: { 'idempotency-key': randomUUID() },
    idempotent: true,
});

export const migrations = (http: Http, clock: Clock) => ({
    get: (id: string) => http.get<Envelope>(`/migrations/${id}`),
    list: () => http.get<MigrationList>('/migrations'),
    resource: <TResult = unknown>(id: string, name: string) => {
        return http.get<Envelope<TResult>>(`/migrations/${id}/resources/${name}`);
    },

    create: async (input: CreateMigrationInput): Promise<Envelope> => {
        assertValid(validateCreateMigration(input));

        return http.post<Envelope>('/migrations', toCreateRequest(input), write());
    },

    /** Closing does not require an offered action. */
    close: async (id: string, input: CloseMigrationInput): Promise<Envelope> => {
        assertValid(validateCloseMigration(input));

        return http.post<Envelope>(`/migrations/${id}/close`, toCloseRequest(input), write());
    },

    /**
     * Poll until the revision changes or the state leaves running.
     * Return the last response when the wait budget runs out.
     */
    waitFor: (id: string, options: WaitOptions<Envelope> = {}): Promise<Envelope> =>
        pollUntil(
            {
                clock,
                done: (envelope, first) => hasMoved(envelope, first.migration.revision),
                intervalMs: pollDelayMs,
                read: () => http.get<Envelope>(`/migrations/${id}`),
            },
            options,
        ),

    runAction: async (id: string, actionId: string, input: RunActionInput): Promise<Envelope> => {
        assertValid(validateActionInput(input.input));

        const path = `/migrations/${id}/actions/${actionId}`;

        return http.post<Envelope>(path, toRunActionRequest(input), write());
    },
});

export type MigrationApi = ReturnType<typeof migrations>;
