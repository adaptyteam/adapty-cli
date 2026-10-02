import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';
import sinon from 'sinon';

import { createMigrationContext } from '../../../../src/cli/context/migration/model.js';
import { createMigrationContextStore } from '../../../../src/cli/context/migration/store.js';
import { CliError } from '../../../../src/cli/errors.js';
import { rejection } from '../../../helpers/rejection.js';

import type { MigrationContextStore } from '../../../../src/cli/context/migration/store.js';

const session = { apiUrl: 'https://api.example.com/api/v1/developer', token: 'secret-token' };
const context = createMigrationContext(session, 'opaque/id');
const posix = process.platform === 'win32' ? it.skip : it;

describe('migration context store', () => {
    let dir: string;
    let store: MigrationContextStore;

    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'adapty-context-'));
        store = createMigrationContextStore(join(dir, 'config'));
    });

    afterEach(async () => {
        sinon.restore();
        await fs.rm(dir, { recursive: true, force: true });
    });

    /** What holds for every context error; `expected` is what the failing operation adds. */
    const expectContextError = async (operation: Promise<unknown>, code: string, ...expected: string[]) => {
        const error = await rejection(operation) as CliError;

        expect(error).to.be.instanceOf(CliError);
        expect(error.exitCode).to.equal(1);
        expect(error.json.code).to.equal(code);
        expect(error.message).to.include(store.path);

        for (const fragment of expected) {
            expect(error.message).to.include(fragment);
        }

        expect(error.message).not.to.include(session.token).and.not.to.include(context.tokenFingerprint);
        expect(JSON.stringify(error.json)).not.to.include(session.token).and.not.to.include(context.tokenFingerprint);

        return error;
    };

    it('treats absence as no selection and clears idempotently', async () => {
        expect(await store.load()).to.equal(undefined);
        await store.clear();
        await store.save(context);
        await store.clear();
        await store.clear();
        expect(await store.load()).to.equal(undefined);
    });

    it('persists a record for a new store instance without storing the raw token', async () => {
        await store.save(context);

        expect(await createMigrationContextStore(join(dir, 'config')).load()).to.deep.equal(context);
        expect(await fs.readFile(store.path, 'utf8')).not.to.include(session.token);

        expect(JSON.parse(await fs.readFile(store.path, 'utf8'))).to.have.all.keys(
            'version', 'tokenFingerprint', 'currentMigrationId',
        );

        expect(context.tokenFingerprint).to.match(/^[a-f0-9]{64}$/);
    });

    posix('creates a private directory and file, including when replacing a loose file', async () => {
        await store.save(context);
        expect((await fs.stat(join(dir, 'config'))).mode & 0o777).to.equal(0o700);
        expect((await fs.stat(store.path)).mode & 0o777).to.equal(0o600);
        await fs.chmod(store.path, 0o644);
        await store.save(context);
        expect((await fs.stat(store.path)).mode & 0o777).to.equal(0o600);
    });

    for (const raw of [
        '{broken secret-token', 'null', '[]', '{}',
        JSON.stringify({ ...context, version: 2 }),
        JSON.stringify({ ...context, currentMigrationId: '  ' }),
        JSON.stringify({ ...context, tokenFingerprint: 'secret-token' }),
    ]) {
        it(`rejects invalid context: ${raw}`, async () => {
            await store.save(context);
            await fs.writeFile(store.path, raw);

            await expectContextError(
                store.load(), 'migration_context_invalid',
                'Invalid migration context', 'migrations unuse', 'migrations use',
            );
        });
    }

    it('replaces and removes malformed context without reading it first', async () => {
        await store.save(context);
        await fs.writeFile(store.path, 'broken');
        await store.save(context);
        expect(await store.load()).to.deep.equal(context);
        await fs.writeFile(store.path, 'broken again');
        await store.clear();
        expect(await store.load()).to.equal(undefined);
    });

    it('reports read and removal I/O errors instead of absence, and says which failed', async () => {
        await fs.mkdir(store.path, { recursive: true });
        await expectContextError(store.load(), 'migration_context_io', 'Could not read', 'migrations unuse');
        await expectContextError(store.clear(), 'migration_context_io', 'Could not remove');
    });

    it('names the errno and keeps the original error, without exposing its contents', async () => {
        const underlying = Object.assign(new Error(session.token), { code: 'EACCES' });

        sinon.stub(fs, 'readFile').rejects(underlying);

        const error = await expectContextError(store.load(), 'migration_context_io', 'Could not read', '(EACCES)');

        expect(error.cause).to.equal(underlying);
    });

    it('preserves the previous record and removes the temporary file when rename fails', async () => {
        await store.save(context);
        sinon.stub(fs, 'rename').rejects(Object.assign(new Error('denied'), { code: 'EACCES' }));

        await expectContextError(
            store.save(createMigrationContext(session, 'next')), 'migration_context_io',
            'Could not save', '(EACCES)', 'previous selection is unchanged',
        );

        expect(await store.load()).to.deep.equal(context);
        expect(await fs.readdir(join(dir, 'config'))).to.deep.equal(['context.json']);
    });

    it('cleans up a partially written temporary file after write failure', async () => {
        await store.save(context);
        const writeFile = fs.writeFile;

        sinon.stub(fs, 'writeFile').callsFake(async (path, _data, options) => {
            await writeFile(path, 'partial', options);
            throw new Error('disk full');
        });

        // An error without an errno leaves nothing safe to repeat: the code names the operation
        // and the original stays reachable only through `cause`.
        const error = await expectContextError(
            store.save(createMigrationContext(session, 'next')), 'migration_context_io', 'Could not save',
        );

        expect(error.message).not.to.include('disk full');
        expect((error.cause as Error).message).to.equal('disk full');
        expect(await store.load()).to.deep.equal(context);
        expect(await fs.readdir(join(dir, 'config'))).to.deep.equal(['context.json']);
    });

    it('supports simultaneous writes without partial records or leftover temporary files', async () => {
        const records = Array.from({ length: 10 }, (_, index) => createMigrationContext(session, `migration-${index}`));
        const rename = fs.rename;
        let activeRenames = 0;
        let maximumActiveRenames = 0;

        sinon.stub(fs, 'rename').callsFake(async (source, destination) => {
            activeRenames++;
            maximumActiveRenames = Math.max(maximumActiveRenames, activeRenames);

            try {
                // Windows can reject overlapping replacements of the same destination with EPERM.
                await new Promise(resolve => setImmediate(resolve));
                await rename(source, destination);
            } finally {
                activeRenames--;
            }
        });

        await Promise.all(records.map(record => store.save(record)));
        expect(maximumActiveRenames).to.equal(1);
        expect(await store.load()).to.deep.equal(records.at(-1));
        expect(await fs.readdir(join(dir, 'config'))).to.deep.equal(['context.json']);
    });
});
