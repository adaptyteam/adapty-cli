import { randomUUID } from 'node:crypto';

import { assertValid } from '../../core/validation.js';

import { toCreateRequest, validateCreateMigration } from './create.js';

import type { CreateMigrationInput } from './create.js';
import type { Envelope, MigrationList } from './model.js';
import type { Http, RequestOptions } from '../../core/http/index.js';

/**
 * Every path of the migrations resource in one place, so the endpoints can be read as a list.
 * What an operation needs of its own — input shape, rules, request body — lives in its own file.
 */

/**
 * Section 4.2: every POST carries an Idempotency-Key, one per call and shared by its retries, so a
 * request that was applied but never answered comes back as the stored answer instead of acting
 * twice. That is also what makes a write safe to retry at all.
 */
const write = (): RequestOptions => ({
    headers: { 'idempotency-key': randomUUID() },
    idempotent: true,
});

export const migrations = (http: Http) => ({
    get: (id: string) => http.get<Envelope>(`/migrations/${id}`),
    list: () => http.get<MigrationList>('/migrations'),
    resource: <TResult = unknown>(id: string, name: string) => {
        return http.get<Envelope<TResult>>(`/migrations/${id}/resources/${name}`);
    },

    /** Async like every validating method: a broken rule arrives as a rejection, as a 400 would. */
    create: async (input: CreateMigrationInput): Promise<Envelope> => {
        assertValid(validateCreateMigration(input));

        return http.post<Envelope>('/migrations', toCreateRequest(input), write());
    },
});

export type MigrationApi = ReturnType<typeof migrations>;
