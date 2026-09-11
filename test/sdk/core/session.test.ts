import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { StorageError } from '../../../src/sdk/core/errors.js';
import { createFileSessionStore } from '../../../src/sdk/core/session.js';
import { rejection } from '../../helpers/rejection.js';

import type { SessionStore } from '../../../src/sdk/core/session.js';

/** File modes mean nothing on Windows, and CI runs there too. */
const posix = process.platform === 'win32' ? it.skip : it;

const session = { token: 'tok_secret_value', user: { email: 'dev@example.com', name: 'Dev' } };

describe('createFileSessionStore', () => {
    let dir: string;
    let store: SessionStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-session-'));
        store = createFileSessionStore(dir);
    });

    it('keeps the on-disk contract the published CLI already writes', async () => {
        await store.save(session);

        expect(store.path).to.equal(join(dir, 'config.json'));

        expect(JSON.parse(await readFile(store.path, 'utf8'))).to.deep.equal({
            access_token: 'tok_secret_value',
            user: { email: 'dev@example.com', name: 'Dev' },
        });
    });

    it('round-trips a session, with and without a user', async () => {
        await store.save(session);
        expect(await store.load()).to.deep.equal(session);

        await store.save({ token: 'tok_2' });
        expect(await store.load()).to.deep.equal({ token: 'tok_2' });
    });

    posix('creates the file 0600 and its directory 0700', async () => {
        const nested = createFileSessionStore(join(dir, 'deeper'));

        await nested.save(session);

        expect((await stat(nested.path)).mode & 0o777).to.equal(0o600);
        expect((await stat(join(dir, 'deeper'))).mode & 0o777).to.equal(0o700);
    });

    posix('tightens the mode of a file that already went loose', async () => {
        // writeFile's `mode` applies only on creation, so a pre-existing 0644 file would keep it
        await writeFile(store.path, '{}\n', { mode: 0o600 });
        await chmod(store.path, 0o644);

        await store.save(session);

        expect((await stat(store.path)).mode & 0o777).to.equal(0o600);
    });

    it('reads a missing file as "not logged in"', async () => {
        expect(await store.load()).to.equal(undefined);
    });

    it('reports corrupted JSON as a StorageError naming the file', async () => {
        await writeFile(store.path, '{ this is not json', { mode: 0o600 });

        const error = await rejection(store.load());

        expect(error).to.be.instanceOf(StorageError);
        expect((error as StorageError).path).to.equal(store.path);
        expect((error as StorageError).message).to.contain(store.path);
    });

    it('lets a read failure that is not "no such file" through', async () => {
        // a directory where the file should be: the store must not report this as "not logged in"
        await mkdir(store.path);

        const error = await rejection(store.load());

        expect(error).to.be.instanceOf(Error);
        expect(error).to.not.be.instanceOf(StorageError);
    });

    it('treats an unknown shape as "not logged in" instead of failing', async () => {
        await writeFile(store.path, JSON.stringify({ token: 'from a newer version' }), { mode: 0o600 });

        expect(await store.load()).to.equal(undefined);
    });

    it('drops a user that is not fully there, keeping the token', async () => {
        await writeFile(store.path, JSON.stringify({ access_token: 'tok', user: { email: 'a@b.c' } }), { mode: 0o600 });

        expect(await store.load()).to.deep.equal({ token: 'tok' });
    });

    it('clears the session, and stays quiet when there is nothing to clear', async () => {
        await store.save(session);
        await store.clear();

        expect(await store.load()).to.equal(undefined);
        await store.clear();
    });
});
