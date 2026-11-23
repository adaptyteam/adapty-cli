import { isSdkError, StorageError } from '../../sdk/core/errors.js';
import { createFileSessionStore } from '../../sdk/core/session.js';
import { CliError, exitCode } from '../errors.js';
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
 * What a command decides itself. Only `auth login` does: it names its region (`--region`), and it
 * replaces the session file rather than lean on it.
 */
export type SessionChoice = {
    region?: Region | undefined;
    replacesFile?: boolean;
};

/**
 * Every product takes the same Adapty developer token, so as whom, in which region and where the
 * session lives are resolved once, here. Where to talk is each product's own: its adapter adds
 * `apiUrl`.
 *
 * ADAPTY_TOKEN wins over the stored token, as the published CLI already does. The file is still
 * read for its region unless ADAPTY_REGION names one, so a script with a token on a machine with a
 * saved EU login goes to EU; a damaged file then stops the command rather than guess the region.
 *
 * `choice.region` is the region a command chose itself (`auth login --region`); it wins over
 * ADAPTY_REGION. A command that replaces the file and knows its region without it needs nothing from
 * a file it cannot trust, so such a file does not stop it: the login is how a user repairs it.
 */
export const loadSession = async (
    config: Config,
    choice: SessionChoice = {},
): Promise<Omit<ResolvedSession, 'apiUrl'>> => {
    // oclif's configDir already knows XDG on unix and LOCALAPPDATA on Windows
    const store = createFileSessionStore(config.configDir);
    const envToken = process.env.ADAPTY_TOKEN;
    const hasEnvToken = envToken !== undefined && envToken !== '';
    const chosenRegion = choice.region ?? regionFromEnv(process.env.ADAPTY_REGION);
    const fileIsReplaced = choice.replacesFile === true && chosenRegion !== undefined;

    // The file is not needed when the token and the region both come from elsewhere
    const fileNeeded = !hasEnvToken || chosenRegion === undefined;
    const stored = fileNeeded ? await readStoredUnlessReplaced(store, fileIsReplaced) : undefined;
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

/** A file the command replaces is not trusted for anything, so a damaged one is only "no session". */
const readStoredUnlessReplaced = async (store: SessionStore, replaced: boolean): Promise<StoredRecord | undefined> => {
    try {
        return await readStored(store);
    } catch (error) {
        if (replaced) {
            return undefined;
        }

        throw error;
    }
};

/**
 * The region decides where the token goes, so a file it cannot trust stops the command. Not JSON, a
 * region of the wrong shape or one this CLI does not know say the same "corrupted" as a broken file
 * always has; a file the OS does not let us read says so, as deleting it is not the cure.
 */
const readStored = async (store: SessionStore): Promise<StoredRecord | undefined> => {
    let stored: Awaited<ReturnType<SessionStore['read']>>;

    try {
        stored = await store.read();
    } catch (error) {
        throw isSdkError(error) ? error : unreadable(store, error);
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

const corrupted = (store: SessionStore): StorageError => new StorageError(`Session file is corrupted: ${store.path}`, store.path);

const unreadable = (store: SessionStore, cause: unknown): CliError => {
    const reason = (cause as NodeJS.ErrnoException | undefined)?.code ?? String(cause);

    return new CliError(
        `Cannot read the session file: ${store.path} (${reason})\nCheck the permissions of the file.`,
        exitCode.auth,
        undefined,
        { cause },
    );
};
