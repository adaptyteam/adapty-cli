import { isSdkError, StorageError } from '../../sdk/core/errors.js';
import { createFileSessionStore } from '../../sdk/core/session.js';
import { isRegion, regionFromEnv } from '../input/region.js';

import type { Session, SessionStore, SessionUser } from '../../sdk/core/session.js';
import type { Region } from '../input/region.js';
import type { Config } from '@oclif/core';

/**
 * The CLI's world resolved into what the sdk asks for: where to talk, as whom, and where the
 * session lives. Env vars are read in cli/base and only there — the sdk never touches process.env,
 * which is what lets the same product code run under an MCP server.
 */
export type ResolvedSession = {
    apiUrl: string;
    /** The region of the command: `auth login --region`, then ADAPTY_REGION, then the saved one, then us. */
    region: Region;
    /**
     * Where the token came from. With ADAPTY_TOKEN in play, "no token in the file" and "not
     * authenticated" are different answers, and `auth status` has to say which one it means.
     */
    source: 'env' | 'file' | 'none';
    /** The store itself, not its path: `auth login`/`logout` write through it. */
    store: SessionStore;
    /** The region of the saved session, when the file was read and names one. */
    storedRegion?: Region | undefined;
    token?: string | undefined;
    user?: SessionUser | undefined;
};

/** What a product command holds once it has demanded the token. */
export type AuthenticatedSession = ResolvedSession & { token: string };

/**
 * Every product takes the same Adapty developer token, so as whom, in which region and where the
 * session lives are resolved once, here. Where to talk is each product's own: its adapter adds
 * `apiUrl`.
 *
 * ADAPTY_TOKEN wins over the stored token, as the published CLI already does. The file is still
 * read for its region unless ADAPTY_REGION names one, so a script with a token on a machine with a
 * saved EU login goes to EU; a damaged file then stops the command rather than guess the region.
 *
 * `region` is the region a command chose itself (`auth login --region`); it wins over ADAPTY_REGION.
 */
export const loadSession = async (config: Config, region?: Region): Promise<Omit<ResolvedSession, 'apiUrl'>> => {
    // oclif's configDir already knows XDG on unix and LOCALAPPDATA on Windows
    const store = createFileSessionStore(config.configDir);
    const envToken = process.env.ADAPTY_TOKEN;
    const hasEnvToken = envToken !== undefined && envToken !== '';
    const chosenRegion = region ?? regionFromEnv(process.env.ADAPTY_REGION);

    // Nothing left to read the file for: the token and the region both come from elsewhere
    const stored = hasEnvToken && chosenRegion !== undefined ? undefined : await readStored(store);
    // The region of the file counts even when its token does not: ADAPTY_TOKEN may stand in for it
    const storedRegion = stored?.region;
    const shared = { region: chosenRegion ?? storedRegion ?? 'us', store, storedRegion };

    if (hasEnvToken) {
        return { ...shared, source: 'env', token: envToken };
    }

    if (stored?.session === undefined) {
        return { ...shared, source: 'none' };
    }

    return { ...shared, source: 'file', token: stored.session.token, user: stored.session.user };
};

/**
 * The region of the saved session for a command that describes it (`auth status`), also when the
 * command itself took both the token and the region from the environment and so never read the file.
 * Such a command does not depend on the file, so a damaged one here only means "no saved region".
 */
export const savedRegion = async (session: Pick<ResolvedSession, 'store' | 'storedRegion'>): Promise<Region | undefined> => {
    if (session.storedRegion !== undefined) {
        return session.storedRegion;
    }

    try {
        return (await readStored(session.store))?.region;
    } catch {
        return undefined;
    }
};

type StoredRecord = { region?: Region | undefined; session?: Session | undefined };

/**
 * The region decides where the token goes, so a file it cannot trust stops the command: unreadable,
 * not JSON, a region of the wrong shape or one this CLI does not know all say the same "corrupted" as
 * a broken file always has.
 */
const readStored = async (store: SessionStore): Promise<StoredRecord | undefined> => {
    let stored: Awaited<ReturnType<SessionStore['read']>>;

    try {
        stored = await store.read();
    } catch (error) {
        throw isSdkError(error) ? error : corrupted(store, error);
    }

    if (stored === undefined) {
        return undefined;
    }

    const { region, session } = stored;

    if (region === undefined || isRegion(region)) {
        return { region, session };
    }

    throw corrupted(store);
};

const corrupted = (store: SessionStore, cause?: unknown): StorageError =>
    new StorageError(`Session file is corrupted: ${store.path}`, store.path, cause === undefined ? undefined : { cause });
