import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { mockFetch, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

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

    it('--help names flows media upload-video and lists no GIF and no HEIC', async () => {
        const { stdout } = await runCommand('flows media upload --help');

        expect(stdout).to.include('flows media upload-video');
        expect(stdout).to.not.match(/gif/i);
        expect(stdout).to.not.match(/heic/i);
    });
});
