import { CliError, describeCleanupFailures } from '../../../../errors.js';

import type { SessionStore } from '../../../../../sdk/core/session.js';
import type { CurrentMigration } from '../../../../context/migration/index.js';

export const clearLocalSession = async (
    session: SessionStore,
    context: CurrentMigration,
): Promise<boolean> => {
    let hadSession: boolean;

    try {
        hadSession = await session.load() !== undefined;
    } catch {
        // Logout can remove unreadable or malformed credentials without decoding them.
        hadSession = true;
    }

    const results = await Promise.allSettled([session.clear(), context.clear()]);
    const failed = describeCleanupFailures([session.path, context.path], results);

    if (failed.length > 0) {
        throw new CliError(
            [
                'Local logout cleanup is incomplete. Could not remove:',
                ...failed.map(failure => `  ${failure.file}: ${failure.reason}`),
                'Check file permissions and run `adapty auth logout` again.',
            ].join('\n'),
            1,
            'auth_cleanup_failed',
            { cause: failed[0]?.cause },
        );
    }

    return hadSession;
};
