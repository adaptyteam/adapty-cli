import { createFileSessionStore } from '../../sdk/core/session.js';

import type { SessionStore, SessionUser } from '../../sdk/core/session.js';
import type { Config } from '@oclif/core';

/**
 * The CLI's world resolved into what the sdk asks for: where to talk, as whom, and where the
 * session lives. Env vars are read in cli/base and only there — the sdk never touches process.env,
 * which is what lets the same product code run under an MCP server.
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

/** What a product command holds once it has demanded the token. */
export type AuthenticatedSession = ResolvedSession & { token: string };

/**
 * Every product takes the same Adapty developer token, so as whom and where the session lives are
 * resolved once, here. Where to talk is each product's own: its adapter adds `apiUrl`.
 *
 * ADAPTY_TOKEN wins over the stored session, as the published CLI already does.
 */
export const loadSession = async (config: Config): Promise<Omit<ResolvedSession, 'apiUrl'>> => {
    // oclif's configDir already knows XDG on unix and LOCALAPPDATA on Windows
    const store = createFileSessionStore(config.configDir);
    const envToken = process.env.ADAPTY_TOKEN;

    if (envToken !== undefined && envToken !== '') {
        return { source: 'env', store, token: envToken };
    }

    const stored = await store.load();

    if (stored === undefined) {
        return { source: 'none', store };
    }

    return { source: 'file', store, token: stored.token, user: stored.user };
};
