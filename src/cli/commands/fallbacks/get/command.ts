import { once } from 'node:events';
import { resolve } from 'node:path';

import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { usageError } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';

import { checkContentType, checkShape } from './lib/shape.js';
import { writeFileAtomic } from './lib/write.js';

import type { FallbackPlatform } from '../../../../sdk/adapty/index.js';

const SDK_VERSION = /^\d+\.\d+\.\d+$/;

/** macOS, iPadOS and visionOS get the same App Store file as iOS, so they are not offered. */
const apiPlatform: Record<'android' | 'ios', FallbackPlatform> = {
    android: 'Android',
    ios: 'iOS',
};

/** What --json returns with --output: the file is on disk, so the result describes it. */
type Written = {
    bytes: number;
    path: string;
    platform: 'android' | 'ios';
    sdk_version: string;
};

const renderWritten = (written: Written): string =>
    `Wrote ${written.platform} fallback to ${written.path} (${written.bytes} bytes)`;

/** A Buffer, not the bare Uint8Array: a stream writer that stringifies its chunk would print "123,34". */
const asBuffer = (chunk: Uint8Array): Buffer => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

export default class FallbacksGet extends AdaptyCommand {
    static override summary = 'Download the fallback file to bundle in your app';
    static override description = [
        'One file per store covers every placement of the app. The SDK reads it when the Adapty backend is unreachable, '
        + 'so fetch a fresh one before every release build.',
        'The server picks the file format from --sdk-version, and the SDK accepts only the one format it was built for: '
        + 'it rejects any other file at startup. Pass the Adapty SDK version the app is built with; for Flutter, React '
        + 'Native and Unity, the Adapty plugin version. The latest mappings:',
        [
            '  --sdk-version          file format (meta.version)',
            '  4.1.0 and later        11',
            '  4.0.x                  10',
            '  3.12.x and later 3.x   9',
            '  3.8.x – 3.11.x         8',
        ].join('\n'),
        'Without --output, stdout is the server\'s file byte for byte, in human mode and with --json alike; nothing else '
        + 'is printed there. A plain `> file` truncates the file before the request, so redirect to a temp file and move '
        + 'it on success, or use --output. With --output, the file is written atomically after a complete download, and '
        + '--json returns a summary {path, platform, sdk_version, bytes} instead of the file.',
    ].join('\n\n');

    static override examples = [
        {
            description: 'Write to a temp file and move it only on success:',
            command: '<%= config.bin %> fallbacks get --app 550e8400-e29b-41d4-a716-446655440000 --platform ios --sdk-version 4.1.0 > ios_fallback.json.tmp && mv ios_fallback.json.tmp ios_fallback.json',
        },
        {
            description: 'Write the file directly; a failed download keeps the old file:',
            command: '<%= config.bin %> fallbacks get --app 550e8400-e29b-41d4-a716-446655440000 --platform android --sdk-version 4.1.0 --output android_fallback.json',
        },
    ];

    static override flags = {
        ...appIdFlag,
        'output': Flags.string({
            description: 'Write the file here instead of stdout; parent directories are created',
        }),
        'platform': Flags.option({
            description: 'Store the file is for: ios (App Store) or android (Play Store)',
            options: ['ios', 'android'] as const,
            required: true,
        })(),
        'sdk-version': Flags.string({
            description: 'The Adapty SDK version the app is built with, X.Y.Z (e.g. 4.1.0); the server picks the file format from it',
            parse: input => (SDK_VERSION.test(input)
                ? Promise.resolve(input)
                : Promise.reject(usageError('Expected X.Y.Z, for example 4.1.0.'))),
            required: true,
        }),
    };

    /** Set once a byte of the file is on stdout: from then on, stdout holds the file and nothing else. */
    #streamed = false;

    /**
     * oclif prints the --json error object to stdout, after whatever is there already. Once file bytes
     * went out, the error goes to stderr instead, so stdout stays a (partial) file and not a mix of two
     * documents. The exit code still tells the caller the file is incomplete.
     */
    override logJson(json: unknown): void {
        if (this.#streamed) {
            process.stderr.write(`${JSON.stringify(json, null, 2)}\n`);

            return;
        }

        super.logJson(json);
    }

    async run(): Promise<undefined | Written> {
        const { flags } = await this.parse(FallbacksGet);
        const input = { platform: apiPlatform[flags.platform], sdkVersion: flags['sdk-version'] };

        if (flags.output === undefined) {
            // Retried until the headers only: bytes on stdout cannot be taken back for a second try.
            const { body, headers } = await this.adapty.fallbacks.download(flags.app, input);

            checkContentType(headers);
            await this.#toStdout(checkShape(body));

            // undefined, so oclif prints no result under --json: the file on stdout is the result
            return undefined;
        }

        const path = resolve(flags.output);

        // The whole attempt runs inside the retry policy, so a body that breaks halfway is downloaded
        // again; the destination is touched only by the final rename of a complete file.
        const bytes = await this.adapty.fallbacks.download(flags.app, input, ({ body, headers }) => {
            checkContentType(headers);

            return writeFileAtomic(path, checkShape(body));
        });

        const written: Written = { bytes, path, platform: flags.platform, sdk_version: flags['sdk-version'] };

        this.render(written, renderWritten);

        return written;
    }

    async #toStdout(chunks: AsyncIterable<Uint8Array>): Promise<void> {
        for await (const chunk of chunks) {
            this.#streamed = true;

            if (!process.stdout.write(asBuffer(chunk))) {
                await once(process.stdout, 'drain');
            }
        }
    }
}
