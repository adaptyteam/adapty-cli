import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Config } from '@oclif/core';

let sessionFile: string;

export const mochaHooks = {
    async beforeAll() {
        process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), 'adapty-cli-config-'));

        // Asked for after XDG is redirected, so the path is the temporary one the tests will use
        const config = await Config.load(join(import.meta.dirname, '..', '..'));

        sessionFile = join(config.configDir, 'config.json');
    },

    /**
     * A successful `auth login` in one test leaves a real session behind, and the next test would
     * read it as "already authenticated"; an env token has the same cross-test effect. Every test
     * starts from a logged-out machine instead.
     */
    async beforeEach() {
        delete process.env.ADAPTY_TOKEN;
        await rm(sessionFile, { force: true });
    },
};
