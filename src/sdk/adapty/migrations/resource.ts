import type { Envelope, MigrationList } from './model.js';
import type { Http } from '../../core/http/index.js';

/**
 * Every read path of the migrations resource in one place, as the endpoints can be read as a
 * list. Writes — create, run, close, uploads — are their own files, added with the operations
 * that need them.
 */
export const migrations = (http: Http) => ({
    get: (id: string) => http.get<Envelope>(`/migrations/${id}`),
    list: () => http.get<MigrationList>('/migrations'),
    resource: <TResult = unknown>(id: string, name: string) => {
        return http.get<Envelope<TResult>>(`/migrations/${id}/resources/${name}`);
    },
});

export type MigrationApi = ReturnType<typeof migrations>;
