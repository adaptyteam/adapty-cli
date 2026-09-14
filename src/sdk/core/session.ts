import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { StorageError } from './errors.js';

export type SessionUser = {
    email: string;
    name: string;
};

export type Session = {
    token: string;
    user?: SessionUser | undefined;
};

/**
 * Where the session lives is a port, not a path: a keychain, a CI secret store or an in-memory
 * store for an MCP server plug into this same type without touching a command.
 */
export type SessionStore = {
    clear(): Promise<void>;
    load(): Promise<Session | undefined>;
    readonly path: string;
    save(session: Session): Promise<void>;
};

/**
 * The file and field names the published CLI already writes. A rename would log every existing
 * user out, so the on-disk contract stays `{ "access_token", "user": { "email", "name" } }`.
 */
const FILE_NAME = 'config.json';

type StoredSession = {
    access_token: string;
    user?: SessionUser | undefined;
};

/** A file under a directory the adapter picks: the sdk touches neither HOME nor process.env. */
export const createFileSessionStore = (dir: string): SessionStore => {
    const path = join(dir, FILE_NAME);

    return {
        path,

        clear: async () => {
            await rm(path, { force: true });
        },

        load: async () => {
            let raw: string;

            try {
                raw = await readFile(path, 'utf8');
            } catch (error) {
                if (isErrno(error, 'ENOENT')) {
                    return undefined;
                }

                // No permission, a broken disk: not ours to paper over as "not logged in"
                throw error;
            }

            let parsed: unknown;

            try {
                parsed = JSON.parse(raw) as unknown;
            } catch (error) {
                throw new StorageError(`Session file is corrupted: ${path}`, path, { cause: error });
            }

            // An unknown shape is most likely a file from another version: asking for a fresh
            // login beats failing every command.
            return toSession(parsed);
        },

        save: async (session) => {
            await mkdir(dir, { recursive: true, mode: 0o700 });
            await writeFile(path, `${JSON.stringify(toStored(session), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            // `mode` above applies only when the file is created; an existing 0644 one (a hand
            // edit, a restored backup) would leave the token readable for everyone on the machine.
            await chmod(path, 0o600);
        },
    };
};

const toStored = (session: Session): StoredSession => (session.user === undefined
    ? { access_token: session.token }
    : { access_token: session.token, user: session.user });

/** Not a full schema check: only the minimum the rest of the code leans on. */
const toSession = (parsed: unknown): Session | undefined => {
    const record = asRecord(parsed);

    if (record === undefined || typeof record.access_token !== 'string' || record.access_token === '') {
        return undefined;
    }

    const user = toUser(record.user);

    return user === undefined ? { token: record.access_token } : { token: record.access_token, user };
};

const toUser = (value: unknown): SessionUser | undefined => {
    const record = asRecord(value);

    if (record === undefined || typeof record.email !== 'string' || typeof record.name !== 'string') {
        return undefined;
    }

    return { email: record.email, name: record.name };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined);

const isErrno = (error: unknown, code: string): boolean =>
    error instanceof Error && 'code' in error && error.code === code;
