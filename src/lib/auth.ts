import { loadSession } from '../cli/base/session.js';
import { toCliError } from '../cli/errors.js';

import { readConfig } from './config.js';

import type { ResolvedSession } from '../cli/base/session.js';
import type { Config } from '@oclif/core';

/** The token alone, as the CLI read it before regions: the old reader the shared file stays compatible with. */
export async function resolveToken(configDir?: string): Promise<null | string> {
    const envToken = process.env.ADAPTY_TOKEN;

    if (envToken) {
        return envToken;
    }

    const config = await readConfig(configDir);

    return config.access_token ?? null;
}

/**
 * The token and the region of the command from the session the new stack reads, so both stacks
 * agree on both. These commands extend oclif's own Command, which maps no sdk error: a damaged file
 * becomes the same exit 3 and text here as in a migrated command.
 */
export async function resolveLegacySession(config: Config): Promise<Omit<ResolvedSession, 'apiUrl'>> {
    try {
        return await loadSession(config);
    } catch (error) {
        throw toCliError(error);
    }
}
