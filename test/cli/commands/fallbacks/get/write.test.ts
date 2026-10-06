import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { expect } from 'chai';

import { writeFileAtomic } from '../../../../../src/cli/commands/fallbacks/get/lib/write.js';
import { CliError } from '../../../../../src/cli/errors.js';
import { rejection } from '../../../../helpers/rejection.js';

const encoder = new TextEncoder();

const chunks = (...parts: string[]): Readable => Readable.from(parts.map(part => encoder.encode(part)));

/** Half a file, then the failure: a source that breaks the way a dropped connection does. */
const breaking = (failure: Error): Readable => Readable.from((function* () {
    yield encoder.encode('{"half": ');
    throw failure;
})());

describe('fallbacks get: writeFileAtomic', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-fallback-write-'));
    });

    afterEach(async () => {
        await rm(dir, { force: true, recursive: true });
    });

    it('streams into the destination, creating parent directories, and returns the byte count', async () => {
        const path = join(dir, 'a', 'b', 'ios_fallback.json');

        const bytes = await writeFileAtomic(path, chunks('{"x": ', '17.0}'));

        expect(await readFile(path, 'utf8')).to.equal('{"x": 17.0}');
        expect(bytes).to.equal(11);
        expect(await readdir(join(dir, 'a', 'b'))).to.deep.equal(['ios_fallback.json']);

        // 0o644 before the umask: the owner reads and writes, nobody else writes, nobody executes
        const { mode } = await stat(path);

        expect(mode & 0o600).to.equal(0o600);
        expect(mode & 0o133).to.equal(0);
    });

    it('overwrites an existing file', async () => {
        const path = join(dir, 'ios_fallback.json');
        await writeFile(path, 'old');

        await writeFileAtomic(path, chunks('new'));

        expect(await readFile(path, 'utf8')).to.equal('new');
    });

    it('removes the temp file when the source breaks, keeps the old file, and rethrows the source error as it is', async () => {
        const path = join(dir, 'ios_fallback.json');
        await writeFile(path, 'old');
        const failure = new Error('connection dropped');

        const error = await rejection(writeFileAtomic(path, breaking(failure)));

        expect(error).to.equal(failure);
        expect(await readFile(path, 'utf8')).to.equal('old');
        expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
    });

    it('removes the temp file when the rename fails, and keeps what sits at the destination', async () => {
        // A non-empty directory at the destination: the temp file is written, the rename fails
        const path = join(dir, 'ios_fallback.json');
        await mkdir(path);
        await writeFile(join(path, 'keep'), 'old');

        const error = await rejection(writeFileAtomic(path, chunks('new')));

        expect(error).to.be.instanceOf(CliError);
        expect((error as CliError).exitCode).to.equal(1);
        expect((error as CliError).code).to.equal('fallback_write_failed');
        expect((error as CliError).message).to.match(/\((EISDIR|ENOTEMPTY|EEXIST|EPERM)\)/);
        expect(await readdir(dir)).to.deep.equal(['ios_fallback.json']);
        expect(await readFile(join(path, 'keep'), 'utf8')).to.equal('old');
    });
});
