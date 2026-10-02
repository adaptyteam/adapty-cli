import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { openCurrentMigration } from '../../../../src/cli/context/migration/index.js';
import { createMigrationContext } from '../../../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../../../src/cli/context/migration/store.js';
import { AuthRequiredError } from '../../../../src/sdk/core/errors.js';
import { rejection } from '../../../helpers/rejection.js';

import type { CliError } from '../../../../src/cli/errors.js';

const session = { token: 'facade-token' };
const other = createMigrationContext({ token: 'another-token' }, 'mig_other');

/**
 * The seam every migration command goes through, so this is where the wiring is checked:
 * priority between the three sources belongs to resolve.test.ts, file behaviour to store.test.ts.
 */
describe('current migration', () => {
    let dir: string;
    let configDir: string;

    const open = (env: NodeJS.ProcessEnv = {}) => openCurrentMigration({ configDir, env, session });

    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'adapty-current-'));
        configDir = join(dir, 'config');
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('saves a selection and reads it back for the same token', async () => {
        const current = open();

        expect(await current.get()).to.equal(undefined);

        await current.set('mig_7x2');

        expect(await current.get()).to.deep.equal({ currentMigrationId: 'mig_7x2', source: 'context' });
        expect(current.path).to.equal(join(configDir, 'context.json'));
    });

    it('reads ADAPTY_MIGRATION from the environment it was opened with, and yields to an explicit ID', async () => {
        const current = open({ ADAPTY_MIGRATION: 'mig_env' });

        await current.set('mig_saved');

        expect(current.overridden).to.equal(true);
        expect(await current.get()).to.deep.equal({ currentMigrationId: 'mig_env', source: 'env' });
        expect(await current.get('mig_flag')).to.deep.equal({ currentMigrationId: 'mig_flag', source: 'flag' });
        expect(open().overridden).to.equal(false);
    });

    it('turns no selection into a usage error only where one is required', async () => {
        const current = open();

        expect(await current.get()).to.equal(undefined);

        const error = await rejection(current.require()) as CliError;

        expect(error.exitCode).to.equal(2);
        expect(error.json.code).to.equal('migration_required');
    });

    it('clears unconditionally, but for a token only when the record is that token\'s', async () => {
        const store = createMigrationContextStore(configDir);

        await store.save(other);
        await open().clearFor(session.token);
        expect(await store.load()).to.deep.equal(other);

        await open().clearFor('another-token');
        expect(await store.load()).to.equal(undefined);

        await store.save(other);
        await open().clear();
        expect(await store.load()).to.equal(undefined);
    });

    it('refuses to save without a token instead of writing an unusable record', async () => {
        const anonymous = openCurrentMigration({ configDir, env: {} });

        expect(await rejection(anonymous.set('mig_7x2'))).to.be.instanceOf(AuthRequiredError);
        expect(await fs.readdir(dir)).to.deep.equal([]);
    });
});
