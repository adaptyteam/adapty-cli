import { DEFAULT_ADAPTY_API_URL } from '../../../sdk/adapty/index.js';
import { createFileSessionStore } from '../../../sdk/core/session.js';

import type { SessionStore, SessionUser } from '../../../sdk/core/session.js';
import type { Config } from '@oclif/core';

/**
 * The CLI's world resolved into what the sdk asks for: where to talk, as whom, and where the
 * session lives. Env vars are read here and only here — the sdk never touches process.env, which
 * is what lets the same product code run under an MCP server.
 */
export type ResolvedSession = {
    apiUrl: string;
    /**
     * Where the token came from. With ADAPTY_TOKEN in play, "no token in the file" and "not
     * authenticated" are different answers, and `auth status` has to say which one it means.
     */
    source: 'env' | 'file' | 'none';
    /** The store itself, not its path: `auth login`/`logout` write through it. */
    store: SessionStore;
    token?: string | undefined;
    user?: SessionUser | undefined;
};

/** ADAPTY_TOKEN wins over the stored session, as the published CLI already does. */
export const resolveSession = async (config: Config): Promise<ResolvedSession> => {
    const apiUrl = process.env.ADAPTY_API_URL ?? DEFAULT_ADAPTY_API_URL;
    // oclif's configDir already knows XDG on unix and LOCALAPPDATA on Windows
    const store = createFileSessionStore(config.configDir);
    const envToken = process.env.ADAPTY_TOKEN;

    if (envToken !== undefined && envToken !== '') {
        return { apiUrl, source: 'env', store, token: envToken };
    }

    const stored = await store.load();

    if (stored === undefined) {
        return { apiUrl, source: 'none', store };
    }

    return { apiUrl, source: 'file', store, token: stored.token, user: stored.user };
};

export const openSession = async (config: Config): Promise<ResolvedSession> => {
    const session = await resolveSession(config);

    if (session.apiUrl !== DEFAULT_ADAPTY_API_URL) {
        // oclif's warn() is silent under --json; the destination warning must remain visible.
        process.stderr.write(`Warning: Using non-default API URL: ${session.apiUrl}\n`);
    }

    return session;
};
