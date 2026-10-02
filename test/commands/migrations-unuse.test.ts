import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { createMigrationContext } from '../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../src/cli/context/migration/store.js';

import type { MigrationContextStore } from '../../src/cli/context/migration/store.js';

describe('migrations unuse', () => {
    let store: MigrationContextStore;
    let fetch: sinon.SinonStub;

    beforeEach(async () => {
        const config = await Config.load(fileURLToPath(new URL('../../', import.meta.url)));
        store = createMigrationContextStore(config.configDir);
        fetch = sinon.stub(globalThis, 'fetch').rejects(new Error('Unexpected network request'));
    });

    afterEach(() => {
        expect(fetch.callCount).to.equal(0);
        sinon.restore();
    });

    for (const state of ['missing', 'other-token', 'malformed']) {
        it(`clears ${state} context without auth and can be repeated`, async () => {
            if (state !== 'missing') {
                await store.save(createMigrationContext({ token: 'other-token' }, 'mig_saved'));
            }

            if (state === 'malformed') {
                await fs.writeFile(store.path, '{broken');
            }

            const { stdout, error } = await runCommand('migrations unuse --json');

            expect(error).to.equal(undefined);
            expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: null });
            expect(await store.load()).to.equal(undefined);
            const again = await runCommand('migrations unuse');
            expect(again.error).to.equal(undefined);
            expect(again.stdout).to.contain('Saved migration selection cleared');
        });
    }

    for (const json of [false, true]) {
        it(`explains the surviving environment override on stderr (json=${json})`, async () => {
            process.env.ADAPTY_MIGRATION = 'mig_env';

            const { stdout, stderr, error } = await runCommand([
                'migrations', 'unuse', ...(json ? ['--json'] : []),
            ]);

            expect(error).to.equal(undefined);
            expect(stderr).to.contain('ADAPTY_MIGRATION');
            expect(stderr).to.contain('Unset it');
            expect(stdout).not.to.contain('Warning');
            expect(process.env.ADAPTY_MIGRATION).to.equal('mig_env');

            if (json) {
                expect(JSON.parse(stdout)).to.deep.equal({ currentMigrationId: null });
            }
        });
    }
});
