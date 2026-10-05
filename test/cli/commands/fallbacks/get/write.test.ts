import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { writeFileAtomic } from '../../../../../src/cli/commands/fallbacks/get/lib/write.js';
import { CliError } from '../../../../../src/cli/errors.js';
import { rejection } from '../../../../helpers/rejection.js';

describe('fallbacks get: writeFileAtomic', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-fallback-write-'));
    });

    afterEach(async () => {
        await rm(dir, { force: true, recursive: true });
    });

    it('creates missing parent directories and leaves only the destination behind', async () => {
        const path = join(dir, 'a', 'b', 'ios_fallback.json');

        await writeFileAtomic(path, '{"x":1}\n');

        expect(await readFile(path, 'utf8')).to.equal('{"x":1}\n');
        expect(await readdir(join(dir, 'a', 'b'))).to.deep.equal(['ios_fallback.json']);
        // 0o644 before the umask: the owner reads and writes, nobody else writes, nobody executes
        const { mode } = await stat(path);

        expect(mode & 0o600).to.equal(0o600);
        expect(mode & 0o133).to.equal(0);
    });

    it('overwrites an existing file', async () => {
        const path = join(dir, 'ios_fallback.json');
        await writeFile(path, 'old');

        await writeFileAtomic(path, 'new');

        expect(await readFile(path, 'utf8')).to.equal('new');
    });

    it('removes the temp file when the rename fails, and keeps what sits at the destination', async () => {
        // A non-empty directory at the destination: the temp file is written, the rename fails
        const path = join(dir, 'ios_fallback.json');
        await mkdir(path);
        await writeFile(join(path, 'keep'), 'old');

        const error = await rejection(writeFileAtomic(path, 'new'));

        expect(error).to.be.instanceOf(CliError);
        expect((error as CliError).exitCode).to.equal(1);
        expect((error as CliError).code).to.equal('fallback_write_failed');
        expect((error as CliError).message).to.match(/\((EISDIR|ENOTEMPTY|EEXIST|EPERM)\)/);
        expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        expect(await readFile(join(path, 'keep'), 'utf8')).to.equal('old');
    });
});
