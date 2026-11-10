import { expect } from 'chai';

import {
    imageMimeType,
    isGif,
    mediaExtension,
    validateImageUpload,
    validateVideoUpload,
    VIDEO_MAX_BYTES,
} from '../../../src/sdk/adapty/flow-media.js';

const GIF_HEAD = new TextEncoder().encode('GIF89a');
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const MP4_HEAD = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74]);

const messages = (issues: readonly { message: string }[]): string[] => issues.map(issue => issue.message);

describe('flow media rules', () => {
    it('mediaExtension reads the last extension in lower case', () => {
        expect(mediaExtension('Intro.MP4')).to.equal('.mp4');
        expect(mediaExtension('clip.tar.webm')).to.equal('.webm');
        expect(mediaExtension('README')).to.equal('');
        expect(mediaExtension('.hidden')).to.equal('');
    });

    it('isGif finds a GIF by its name and by its signature', () => {
        expect(isGif('anim.GIF', PNG_HEAD)).to.equal(true);
        expect(isGif('x.png', new TextEncoder().encode('GIF87a'))).to.equal(true);
        expect(isGif('x.mp4', GIF_HEAD)).to.equal(true);
        expect(isGif('x.png', PNG_HEAD)).to.equal(false);
        expect(isGif('x.png', new Uint8Array([0x47, 0x49]))).to.equal(false);
    });

    it('imageMimeType has no GIF and no HEIC', () => {
        expect(imageMimeType('hero.png')).to.equal('image/png');
        expect(imageMimeType('hero.JPG')).to.equal('image/jpeg');
        expect(imageMimeType('hero.svg')).to.equal('image/svg+xml');
        expect(imageMimeType('hero.webp')).to.equal('image/webp');
        expect(imageMimeType('anim.gif')).to.equal('application/octet-stream');
        expect(imageMimeType('hero.heic')).to.equal('application/octet-stream');
    });

    describe('validateImageUpload', () => {
        const cases: { expected: string[]; head: Uint8Array; name: string }[] = [
            { expected: [], head: PNG_HEAD, name: 'hero.png' },
            { expected: [], head: PNG_HEAD, name: 'hero.jpeg' },
            { expected: [], head: PNG_HEAD, name: 'hero.webp' },
            { expected: ['GIF is not supported.'], head: GIF_HEAD, name: 'anim.gif' },
            { expected: ['GIF is not supported.'], head: GIF_HEAD, name: 'x.png' },
            // The GIF rule comes first, also before the video rule
            { expected: ['GIF is not supported.'], head: GIF_HEAD, name: 'x.mp4' },
            { expected: ['This is a video file. Use flows media upload-video.'], head: MP4_HEAD, name: 'intro.mp4' },
            { expected: ['This is a video file. Use flows media upload-video.'], head: MP4_HEAD, name: 'intro.webm' },
            { expected: ['This is a video file. Use flows media upload-video.'], head: MP4_HEAD, name: 'clip.MOV' },
            { expected: ['Only PNG, JPEG, WEBP and SVG images are allowed.'], head: PNG_HEAD, name: 'hero.heic' },
        ];

        for (const { expected, head, name } of cases) {
            it(`${name} → ${expected[0] ?? 'accepted'}`, () => {
                expect(messages(validateImageUpload({ head, name }))).to.deep.equal(expected);
            });
        }
    });

    describe('validateVideoUpload', () => {
        const cases: { expected: string[]; head: Uint8Array; name: string; size: number }[] = [
            { expected: [], head: MP4_HEAD, name: 'intro.mp4', size: 1000 },
            { expected: [], head: MP4_HEAD, name: 'intro.WEBM', size: VIDEO_MAX_BYTES },
            { expected: ['GIF is not supported.'], head: GIF_HEAD, name: 'anim.gif', size: 1000 },
            { expected: ['GIF is not supported.'], head: GIF_HEAD, name: 'x.mp4', size: VIDEO_MAX_BYTES + 1 },
            { expected: ['Only mp4 and webm videos are allowed.'], head: MP4_HEAD, name: 'clip.mov', size: 1000 },
            { expected: ['Only mp4 and webm videos are allowed.'], head: PNG_HEAD, name: 'clip.webp', size: 1000 },
            { expected: ['Only mp4 and webm videos are allowed.'], head: MP4_HEAD, name: 'clip', size: 1000 },
            { expected: ['File size must not exceed 50 MiB.'], head: MP4_HEAD, name: 'big.mp4', size: VIDEO_MAX_BYTES + 1 },
        ];

        for (const { expected, head, name, size } of cases) {
            it(`${name} of ${size} bytes → ${expected[0] ?? 'accepted'}`, () => {
                expect(messages(validateVideoUpload({ head, name, size }))).to.deep.equal(expected);
            });
        }
    });
});
