import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';

import { CliError, errorCode } from '../../errors.js';

import { isMigrationContext } from './model.js';

import type { MigrationContext } from './model.js';

export type MigrationContextStore = {
    readonly path: string;
    load(): Promise<MigrationContext | undefined>;
    save(context: MigrationContext): Promise<void>;
    clear(): Promise<void>;
};

const REPLACE = 'Run `adapty migrations unuse` to remove it or `adapty migrations use <id>` to replace it.';

type ContextFailure = 'invalid' | 'read' | 'remove' | 'write';

/**
 * Two stable codes, but not one text: a malformed record, a denied read and a full disk are fixed
 * in three different places, and the errno is what says which. The original travels as `cause`
 * rather than in the message, because that message may quote the record — and the record carries a
 * token fingerprint.
 */
const contextError = (path: string, failure: ContextFailure, cause?: unknown): CliError => {
    const errno = errorCode(cause);
    const file = errno === undefined ? path : `${path} (${errno})`;

    const messages: Record<ContextFailure, string> = {
        invalid: `Invalid migration context: ${path}. ${REPLACE}`,
        read: `Could not read migration context: ${file}. Check its permissions and ownership. ${REPLACE}`,
        remove: `Could not remove migration context: ${file}. Check its permissions and ownership, or remove the file yourself.`,
        write: `Could not save migration context: ${file}. Check the permissions and free space of its directory; the previous selection is unchanged.`,
    };

    return new CliError(
        messages[failure],
        1,
        failure === 'invalid' ? 'migration_context_invalid' : 'migration_context_io',
        { cause },
    );
};

const isMissing = (error: unknown): boolean => {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
};

/** CLI-owned state, separate from credentials. Concurrent mutations are applied in call order. */
export const createMigrationContextStore = (dir: string): MigrationContextStore => {
    const path = join(dir, 'context.json');
    let mutations = Promise.resolve();

    const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
        const result = mutations.then(operation);

        // A failed mutation must not prevent later calls from running.
        mutations = result.then(() => undefined, () => undefined);

        return result;
    };

    const store: MigrationContextStore = {
        path,
        async load() {
            let raw: string;

            try {
                raw = await fs.readFile(path, 'utf8');
            } catch (error) {
                if (isMissing(error)) {
                    return undefined;
                }

                throw contextError(path, 'read', error);
            }

            let parsed: unknown;

            try {
                parsed = JSON.parse(raw) as unknown;
            } catch (error) {
                throw contextError(path, 'invalid', error);
            }

            if (!isMigrationContext(parsed)) {
                throw contextError(path, 'invalid');
            }

            return parsed;
        },
        async save(context) {
            if (!isMigrationContext(context)) {
                throw contextError(path, 'invalid');
            }

            return mutate(async () => {
                const temporary = join(dir, `.context-${randomUUID()}.tmp`);

                try {
                    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

                    await fs.writeFile(temporary, `${JSON.stringify(context, null, 2)}\n`, {
                        encoding: 'utf8', flag: 'wx', mode: 0o600,
                    });

                    await fs.rename(temporary, path);
                } catch (error) {
                    // Never remove the destination on failure: it may hold a previous selection.
                    try {
                        await fs.rm(temporary, { force: true });
                    } catch {
                        // Preserve the context-specific error if cleanup also fails.
                    }

                    throw contextError(path, 'write', error);
                }
            });
        },
        async clear() {
            return mutate(async () => {
                try {
                    await fs.rm(path, { force: true });
                } catch (error) {
                    throw contextError(path, 'remove', error);
                }
            });
        },
    };

    return store;
};
