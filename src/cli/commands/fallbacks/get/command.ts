import { resolve } from 'node:path';

import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { usageError } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { renderJson } from '../../../views/json.js';

import { writeFileAtomic } from './lib/write.js';

import type { FallbackFile, FallbackPlatform } from '../../../../sdk/adapty/index.js';

const SDK_VERSION = /^\d+\.\d+\.\d+$/;

/** macOS, iPadOS and visionOS get the same App Store file as iOS, so they are not offered. */
const apiPlatform: Record<'android' | 'ios', FallbackPlatform> = {
    android: 'Android',
    ios: 'iOS',
};

/** What --json returns with --output: the file is on disk, so the result describes it. */
type Written = {
    bytes: number;
    meta_version: number;
    path: string;
    placements: number;
    platform: 'android' | 'ios';
    sdk_version: string;
};

const renderWritten = (written: Written): string => `Wrote ${written.platform} fallback to ${written.path} `
    + `(meta version ${written.meta_version}, ${written.placements} placements, ${written.bytes} bytes)`;

export default class FallbacksGet extends AdaptyCommand {
    static override summary = 'Download the fallback file to bundle in your app';
    static override description = [
        'One file per store covers every placement of the app. The SDK reads it when the Adapty backend is unreachable, '
        + 'so fetch a fresh one before every release build.',
        'Without --output, stdout is the file itself, in human mode and with --json alike; nothing else is printed there. '
        + 'With --output, the file is written atomically after a successful download, and --json returns a summary '
        + '{path, platform, sdk_version, meta_version, placements, bytes} instead of the file.',
    ].join('\n\n');

    static override examples = [
        {
            description: 'Write to a temp file and move it only on success (a plain `> file` leaves an empty file when the request fails):',
            command: '<%= config.bin %> fallbacks get --app 550e8400-e29b-41d4-a716-446655440000 --platform ios --sdk-version 4.1.0 > ios_fallback.json.tmp && mv ios_fallback.json.tmp ios_fallback.json',
        },
        {
            description: 'Write the file directly; a failed request keeps the old file:',
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
            description: 'The Adapty SDK version in your app, X.Y.Z (e.g. 4.1.0); the server picks the file format from it',
            parse: input => (SDK_VERSION.test(input)
                ? Promise.resolve(input)
                : Promise.reject(usageError('Expected X.Y.Z, for example 4.1.0.'))),
            required: true,
        }),
    };

    async run(): Promise<FallbackFile | Written> {
        const { flags } = await this.parse(FallbacksGet);

        const file = await this.adapty.fallbacks.get(flags.app, {
            platform: apiPlatform[flags.platform],
            sdkVersion: flags['sdk-version'],
        });

        if (flags.output === undefined) {
            this.render(file, renderJson);

            return file;
        }

        // The request has succeeded by now: a failed one never touches the destination.
        const path = resolve(flags.output);
        const content = `${renderJson(file)}\n`;

        await writeFileAtomic(path, content);

        const written: Written = {
            bytes: Buffer.byteLength(content),
            meta_version: file.meta.version,
            path,
            placements: file.meta.developer_ids.length,
            platform: flags.platform,
            sdk_version: flags['sdk-version'],
        };

        this.render(written, renderWritten);

        return written;
    }
}
