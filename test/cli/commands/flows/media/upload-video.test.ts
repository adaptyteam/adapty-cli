import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../../../../src/cli/errors.js';
import { VIDEO_MAX_BYTES } from '../../../../../src/sdk/adapty/flow-media.js';
import { mockFetch, mockFetchFailure, restoreFetch, TEST_APP_ID } from '../../../../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const MP4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const ANIMATED_WEBP = Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8X', 'latin1');

const VIDEO = {
    height: 1920,
    preview_base64: 'data-blob',
    preview_url: 'https://cdn.example.com/video/abc/preview.jpg',
    video_url: 'https://cdn.example.com/video/abc/hls/master.m3u8',
    width: 1080,
};

describe('flows media upload-video', () => {
    let dir: string;
    let fetchStub: sinon.SinonStub | undefined;

    const file = async (name: string, content: Buffer): Promise<string> => {
        const path = join(dir, name);
        await writeFile(path, content);

        return path;
    };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-video-'));
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(async () => {
        // oclif sets the exit code of a --json failure on the process
        process.exitCode = undefined;

        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        await rm(dir, { force: true, recursive: true });
    });

    it('posts the video as the file field and prints the video URL, preview URL, width and height', async () => {
        fetchStub = mockFetch([VIDEO]);
        const path = await file('intro.mp4', MP4);

        const { error, stdout } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID}`);

        expect(error).to.equal(undefined);
        expect(fetchStub.callCount).to.equal(1);
        expect(String(fetchStub.getCall(0).args[0])).to.match(new RegExp(`/apps/${TEST_APP_ID}/flows/media/videos/$`));

        const init = fetchStub.getCall(0).args[1] as { body: FormData; method: string };
        const sent = init.body.get('file') as File;

        expect(init.method).to.equal('POST');
        expect(sent.name).to.equal('intro.mp4');
        expect(sent.type).to.equal('video/mp4');

        expect(stdout).to.equal([
            'Video uploaded!',
            `Video URL: ${VIDEO.video_url}`,
            `Preview URL: ${VIDEO.preview_url}`,
            'Width: 1080',
            'Height: 1920',
            '',
        ].join('\n'));
    });

    it('prints the full answer with --json', async () => {
        fetchStub = mockFetch([VIDEO]);
        const path = await file('intro.webm', MP4);

        const { stdout } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID} --json`);

        expect(JSON.parse(stdout)).to.deep.equal(VIDEO);
    });

    describe('refuses before a send', () => {
        const cases: { content: Buffer; message: string; name: string }[] = [
            { content: GIF, message: 'GIF is not supported.', name: 'anim.gif' },
            { content: GIF, message: 'GIF is not supported.', name: 'renamed.mp4' },
            { content: MP4, message: 'Only mp4 and webm videos are allowed.', name: 'clip.mov' },
            { content: ANIMATED_WEBP, message: 'Only mp4 and webm videos are allowed.', name: 'clip.webp' },
        ];

        for (const { content, message, name } of cases) {
            it(`${name}: ${message}`, async () => {
                fetchStub = mockFetch([VIDEO]);
                const path = await file(name, content);

                const { error } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID}`);

                expect(error?.message).to.equal(`Invalid input:\n  ${message}`);
                expect(process.exitCode).to.equal(exitCode.usage);
                expect(fetchStub.callCount).to.equal(0);
            });
        }

        it('a file over 50 MiB: the text names 50 MiB', async () => {
            fetchStub = mockFetch([VIDEO]);
            const path = await file('big.mp4', MP4);
            await truncate(path, VIDEO_MAX_BYTES + 1024 * 1024);

            const { error } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID}`);

            expect(error?.message).to.equal('Invalid input:\n  File size must not exceed 50 MiB.');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('a refused file needs no token', async () => {
            delete process.env.ADAPTY_TOKEN;
            fetchStub = mockFetch([VIDEO]);
            const path = await file('anim.gif', GIF);

            const { error } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID}`);

            expect(error?.message).to.equal('Invalid input:\n  GIF is not supported.');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('a file it cannot read', async () => {
            const missing = join(dir, 'missing.mp4');

            const { error } = await runCommand(`flows media upload-video ${missing} --app ${TEST_APP_ID}`);

            expect(error?.message).to.equal(`Cannot read file: ${missing}`);
            expect(error?.oclif?.exit).to.equal(exitCode.usage);
        });
    });

    it('shows the server refusal of a duration or a size in pixels', async () => {
        const refusal = { error_code: 'base_error', errors: { non_field_errors: ['Video duration should not exceed 30 seconds'] }, status_code: 400 };
        fetchStub = mockFetchFailure(refusal, { status: 400 });
        const path = await file('long.mp4', MP4);

        const { error } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID}`);

        expect(error?.message).to.equal('Video duration should not exceed 30 seconds');
        expect(error?.oclif?.exit).to.equal(exitCode.api);
    });

    describe('under --json prints the refusal text with the same exit code', () => {
        const cases: { content: Buffer; message: string; name: string; size?: number }[] = [
            { content: GIF, message: 'Invalid input:\n  GIF is not supported.', name: 'anim.gif' },
            { content: MP4, message: 'Invalid input:\n  Only mp4 and webm videos are allowed.', name: 'clip.mov' },
            { content: MP4, message: 'Invalid input:\n  File size must not exceed 50 MiB.', name: 'big.mp4', size: VIDEO_MAX_BYTES + 1 },
        ];

        for (const { content, message, name, size } of cases) {
            it(`${name}: ${message.split('\n  ')[1] ?? message}`, async () => {
                fetchStub = mockFetch([VIDEO]);
                const path = await file(name, content);

                if (size !== undefined) {
                    await truncate(path, size);
                }

                const { stdout } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID} --json`);

                expect(JSON.parse(stdout)).to.deep.equal({ error: { message } });
                expect(process.exitCode).to.equal(exitCode.usage);
                expect(fetchStub.callCount).to.equal(0);
            });
        }

        it('a 404 of the video route is the generic API error', async () => {
            fetchStub = mockFetchFailure({ detail: 'Not found.' }, { status: 404 });
            const path = await file('intro.mp4', MP4);

            const { stdout } = await runCommand(`flows media upload-video ${path} --app ${TEST_APP_ID} --json`);
            const json = JSON.parse(stdout) as { error: { code: string; status: number } };

            expect(json.error.code).to.equal('http_404');
            expect(json.error.status).to.equal(404);
            expect(process.exitCode).to.equal(exitCode.api);
        });
    });

    it('--help says it uploads a flow builder video, names mp4 and webm and no numeric limit', async () => {
        const { stdout } = await runCommand('flows media upload-video --help');

        expect(stdout).to.match(/Upload a video as a flow builder asset/);
        expect(stdout).to.include('mp4');
        expect(stdout).to.include('webm');
        expect(stdout).to.not.match(/\b\d+\s*(?:MiB|MB|KB|GB|s|sec|seconds?|px)\b/i);
        expect(stdout).to.not.match(/\b(?:30|50|640)\b/);
    });
});
