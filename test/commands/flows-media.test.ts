import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const MP4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

const IMAGE = { id: 42, name: 'hero.png', preview_base64: 'data-blob', url: 'https://cdn.example.com/hero.png' };

describe('flows media upload', () => {
    let dir: string;
    let fetchStub: sinon.SinonStub;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-image-'));
        process.env.ADAPTY_TOKEN = 'test-token';
        fetchStub = mockFetch([IMAGE]);
    });

    afterEach(async () => {
        // oclif sets the exit code of a --json failure on the process
        process.exitCode = undefined;
        restoreFetch(fetchStub);
        await rm(dir, { force: true, recursive: true });
    });

    const upload = async (name: string, content: Buffer) => {
        const path = join(dir, name);
        await writeFile(path, content);

        return runCommand(`flows media upload ${path} --app ${TEST_APP_ID}`);
    };

    it('uploads a png and prints the id, name and url', async () => {
        const { error, stdout } = await upload('hero.png', PNG);

        expect(error).to.equal(undefined);
        expect(fetchStub.callCount).to.equal(1);
        expect(stdout).to.equal(['Image uploaded!', 'ID: 42', 'Name: hero.png', `URL: ${IMAGE.url}`, ''].join('\n'));
    });

    const HEAVY_WARNING = {
        code: 'heavy_image',
        message: 'Large images slow the first load. Upload a smaller file.',
        title: 'Large image — 1.5 MB',
    };

    const LIGHT = { ...IMAGE, size: 655_360, warnings: [] };
    const HEAVY = { ...IMAGE, size: 1_572_864, warnings: [HEAVY_WARNING] };
    const imageLines = ['Image uploaded!', 'ID: 42', 'Name: hero.png', `URL: ${IMAGE.url}`];
    // The warning text without the wrap of oclif: its line breaks, its indentation and its margin
    // mark, ` ›` on most platforms and ` »` on Windows.
    const unwrap = (stderr: string): string => stderr.replaceAll(/[»›]/g, ' ').replaceAll(/\s+/g, ' ');

    it('a light image prints its size and no warning', async () => {
        restoreFetch(fetchStub);
        fetchStub = mockFetch([LIGHT]);

        const { error, stderr, stdout } = await upload('hero.png', PNG);

        expect(error).to.equal(undefined);
        expect(stdout).to.equal([...imageLines, 'Size: 640 KB', ''].join('\n'));
        expect(stderr).to.equal('');
    });

    it('a heavy image prints its size and one warning line, exit 0', async () => {
        restoreFetch(fetchStub);
        fetchStub = mockFetch([HEAVY]);

        const { error, stderr, stdout } = await upload('hero.png', PNG);

        expect(error).to.equal(undefined);
        expect(stdout).to.equal([...imageLines, 'Size: 1.5 MB', ''].join('\n'));

        // oclif wraps a warning to the terminal width; the line is one warning, whatever the wrap.
        expect(stderr.match(/Warning:/g)).to.have.length(1);
        expect(unwrap(stderr)).to.include('Large image — 1.5 MB. Large images slow the first load. Upload a smaller file.');
    });

    it('--json returns the whole server body with size and warnings, and no warning line', async () => {
        restoreFetch(fetchStub);
        fetchStub = mockFetch([HEAVY]);
        const path = join(dir, 'hero.png');
        await writeFile(path, PNG);

        const { error, stderr, stdout } = await runCommand(`flows media upload ${path} --app ${TEST_APP_ID} --json`);

        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal(HEAVY);
        expect(stderr).to.equal('');
        expect(process.exitCode).to.equal(undefined);
    });

    it('an older server without size and warnings: no Size line, no warning, exit 0', async () => {
        const { error, stderr, stdout } = await upload('hero.png', PNG);

        expect(error).to.equal(undefined);
        expect(stdout).to.equal([...imageLines, ''].join('\n'));
        expect(stderr).to.equal('');
    });

    it('a server refusal keeps the error and exit 1, with no Size line and no warning', async () => {
        restoreFetch(fetchStub);

        fetchStub = mockFetchFailure(
            { error_code: 'media_file_too_large', errors: { file: ['File size must not exceed 20 MiB.'] }, status_code: 413 },
            { status: 413 },
        );

        const { error, stderr, stdout } = await upload('hero.png', PNG);

        expect(error?.message).to.equal('file: File size must not exceed 20 MiB.');
        // oclif exits 1 for an error that carries no exit code of its own.
        expect(error?.oclif?.exit ?? 1).to.equal(1);
        expect(stdout).to.not.include('Size:');
        expect(stdout).to.not.include('Image uploaded!');
        expect(stderr).to.not.include('Large image');
    });

    const refusals: { content: Buffer; message: string; name: string }[] = [
        { content: GIF, message: 'GIF is not supported.', name: 'anim.gif' },
        { content: GIF, message: 'GIF is not supported.', name: 'renamed.png' },
        { content: MP4, message: 'This is a video file. Use flows media upload-video.', name: 'intro.mp4' },
        { content: MP4, message: 'This is a video file. Use flows media upload-video.', name: 'intro.webm' },
        { content: MP4, message: 'This is a video file. Use flows media upload-video.', name: 'clip.mov' },
        { content: PNG, message: 'Only PNG, JPEG, WEBP and SVG images are allowed.', name: 'hero.heic' },
    ];

    for (const { content, message, name } of refusals) {
        it(`refuses ${name} before a send: ${message}`, async () => {
            const { error } = await upload(name, content);

            expect(error?.message).to.equal(message);
            expect(error?.oclif?.exit).to.equal(2);
            expect(fetchStub.callCount).to.equal(0);
        });
    }

    for (const { content, message, name } of refusals) {
        it(`refuses ${name} under --json with the text and exit 2`, async () => {
            const path = join(dir, name);
            await writeFile(path, content);

            const { stdout } = await runCommand(`flows media upload ${path} --app ${TEST_APP_ID} --json`);

            expect(JSON.parse(stdout)).to.deep.equal({ error: { message } });
            expect(process.exitCode).to.equal(2);
            expect(fetchStub.callCount).to.equal(0);
        });
    }

    it('the flows media topic in flows --help names both upload commands', async () => {
        const { stdout } = await runCommand('flows --help');
        const topic = stdout.slice(stdout.indexOf('flows media'), stdout.indexOf('flows metrics')).replaceAll(/\s+/g, ' ');

        expect(topic).to.include('images (flows media upload)');
        expect(topic).to.include('videos (flows media upload-video)');
        expect(topic).to.not.match(/\d/);
    });

    it('--help names flows media upload-video and lists no GIF and no HEIC', async () => {
        const { stdout } = await runCommand('flows media upload --help');

        expect(stdout).to.include('flows media upload-video');
        expect(stdout).to.not.match(/gif/i);
        expect(stdout).to.not.match(/heic/i);
    });
});
