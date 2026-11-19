import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { StorageError } from './errors.js';

export type SessionUser = {
    email?: string | undefined;
    name: string;
};

export type Session = {
    /**
     * The adapter's name for where the account lives. The sdk keeps it as written and checks
     * nothing: which names exist and what a missing one means is the adapter's knowledge.
     */
    region?: string | undefined;
    token: string;
    user?: SessionUser | undefined;
};

/**
 * Where the session lives is a port, not a path: a keychain, a CI secret store or an in-memory
 * store for an MCP server plug into this same type without touching a command.
 */
export type SessionStore = {
    clear(): Promise<void>;
    /** The session, when the store holds a usable token. */
    load(): Promise<Session | undefined>;
    readonly path: string;
    /**
     * What the store holds, read once: the session when its token is usable, and the region either
     * way, because a token may come from elsewhere while the region still has to come from here.
     */
    read(): Promise<StoredRecord | undefined>;
    save(session: Session): Promise<void>;
};

export type StoredRecord = {
    region?: string | undefined;
    session?: Session | undefined;
};

/**
 * The file and field names the published CLI already writes. A rename would log every existing
 * user out, so the on-disk contract stays `{ "access_token", "user": { "email", "name" }, "region" }`,
 * where only a file written before the server stopped sending the email still has one, and only a
 * file written by a login that knows regions has `region`. An older reader ignores the field.
 */
const FILE_NAME = 'config.json';

type StoredSession = {
    access_token: string;
    region?: string | undefined;
    user?: SessionUser | undefined;
};

/** A file under a directory the adapter picks: the sdk touches neither HOME nor process.env. */
export const createFileSessionStore = (dir: string): SessionStore => {
    const path = join(dir, FILE_NAME);

    const corrupted = (cause?: unknown): StorageError =>
        new StorageError(`Session file is corrupted: ${path}`, path, cause === undefined ? undefined : { cause });

    const read = async (): Promise<StoredRecord | undefined> => {
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
            throw corrupted(error);
        }

        const region = asRecord(parsed)?.region;

        // A missing region is a file of an older version; a region of the wrong shape is damage
        if (region !== undefined && typeof region !== 'string') {
            throw corrupted();
        }

        // An unknown shape is most likely a file from another version: asking for a fresh
        // login beats failing every command.
        return { region, session: toSession(parsed) };
    };

    return {
        path,

        clear: async () => {
            await rm(path, { force: true });
        },

        load: async () => {
            const record = await read();

            return record?.session;
        },

        read,

        save: async (session) => {
            await mkdir(dir, { recursive: true, mode: 0o700 });
            await writeFile(path, `${JSON.stringify(toStored(session), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            // `mode` above applies only when the file is created; an existing 0644 one (a hand
            // edit, a restored backup) would leave the token readable for everyone on the machine.
            await chmod(path, 0o600);
        },
    };
};

const toStored = (session: Session): StoredSession => ({
    access_token: session.token,
    ...(session.user === undefined ? {} : { user: session.user }),
    ...(session.region === undefined ? {} : { region: session.region }),
});

/** Not a full schema check: only the minimum the rest of the code leans on. */
const toSession = (parsed: unknown): Session | undefined => {
    const record = asRecord(parsed);

    if (record === undefined || typeof record.access_token !== 'string' || record.access_token === '') {
        return undefined;
    }

    const user = toUser(record.user);

    return {
        token: record.access_token,
        ...(user === undefined ? {} : { user }),
        ...(typeof record.region === 'string' ? { region: record.region } : {}),
    };
};

const toUser = (value: unknown): SessionUser | undefined => {
    const record = asRecord(value);

    if (record === undefined || typeof record.name !== 'string') {
        return undefined;
    }

    return typeof record.email === 'string' ? { email: record.email, name: record.name } : { name: record.name };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined);

const isErrno = (error: unknown, code: string): boolean =>
    error instanceof Error && 'code' in error && error.code === code;
