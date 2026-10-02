import { CliError, describeCleanupFailures } from '../../../../errors.js';

import type { SessionStore } from '../../../../../sdk/core/session.js';
import type { CurrentMigration } from '../../../../context/migration/index.js';

/**
 * ADAPTY_TOKEN may override a different, still-valid file session, which revocation must leave
 * alone. Read-then-remove, not a compare-and-delete: a concurrent `login` can land in between and
 * lose its fresh credentials, which asks for another `adapty auth login` and never keeps a revoked
 * token readable. See `CurrentMigration.clearFor`, which drops the selection under the same rule.
 */
const clearMatchingSession = async (store: SessionStore, token: string): Promise<void> => {
    const stored = await store.load();

    if (stored?.token === token) {
        await store.clear();
    }
};

/** Called only after server success; each local cleanup is attempted independently. */
export const clearRevokedSession = async (
    session: SessionStore,
    context: CurrentMigration,
    token: string,
): Promise<void> => {
    const results = await Promise.allSettled([
        clearMatchingSession(session, token),
        context.clearFor(token),
    ]);

    const files = [session.path, context.path];
    const failed = describeCleanupFailures(files, results);

    if (failed.length > 0) {
        throw new CliError(
            [
                'Token revoked on the server, but local cleanup is incomplete for:',
                ...failed.map(failure => `  ${failure.file}: ${failure.reason}`),
                'Check or remove these local files; do not repeat revocation.',
            ].join('\n'),
            1,
            'auth_cleanup_failed',
            { cause: failed[0]?.cause },
        );
    }
};
