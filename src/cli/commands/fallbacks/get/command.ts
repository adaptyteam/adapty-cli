import { resolve } from 'node:path';

import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { usageError } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { flagPassed, streamToStdout, writeJsonToStderr } from '../../../output/file-to-stdout.js';

import { renderWritten } from './lib/render.js';
import { checkContentType, checkShape } from './lib/shape.js';
import { explainHeadersTimeout } from './lib/timeout.js';
import { prepareDestination, writeFileAtomic } from './lib/write.js';

import type { FallbackPlatform } from '../../../../sdk/adapty/index.js';

const SDK_VERSION = /^\d+\.\d+\.\d+$/;

/** macOS, iPadOS and visionOS get the same App Store file as iOS, so they are not offered. */
const apiPlatform = {
    android: 'Android',
    ios: 'iOS',
} as const satisfies Record<string, FallbackPlatform>;

type Platform = keyof typeof apiPlatform;

/** What --json returns with --output: the file is on disk, so the result describes it. */
type Written = {
    bytes: number;
    path: string;
    platform: Platform;
    sdk_version: string;
};

export default class FallbacksGet extends AdaptyCommand {
    static override summary = 'Download the fallback file to bundle in your app';
    static override description = [
        'One file per store covers every placement of the app: the same file as the dashboard download. The SDK reads '
        + 'it when the Adapty backend is unreachable, so fetch a fresh one in each release build.',
        'The server picks the file format from --sdk-version, and the SDK accepts only the one format it was built for: '
        + 'it rejects any other file at startup. Pass the Adapty SDK version the app is built with; for Flutter, React '
        + 'Native and Unity, the Adapty plugin version. The CLI keeps no version list: the server picks the format. '
        + 'The formats today:',
        [
            '  --sdk-version          file format (meta.version)',
            '  below 3.0              5',
            '  3.0.x – 3.3.x          6',
            '  3.4.x – 3.7.x          7',
            '  3.8.x – 3.11.x         8',
            '  3.12.x and later 3.x   9',
            '  4.0.x                  10',
            '  4.1.x – 4.3.x          11',
            '  4.4.0 and later        12',
        ].join('\n'),
        'Paywall placements are in every format. Flow placements are only in the files for SDK 4.0 and later '
        + '(formats 10, 11 and 12).',
        'The server allows 30 downloads per hour for each app, shared by all tokens of the app; after that it answers '
        + '429. Run the command in a release build, not on each commit. A CI job gives the token in the ADAPTY_TOKEN '
        + 'environment variable.',
        'The command sends exactly one request and never retries: the server builds the file for every request, and '
        + 'a retry after a failure starts that build again. A CI job that wants a retry should wait at least the '
        + 'Retry-After the server sent (retry_after_seconds in the --json error) before it runs the command again. The '
        + 'server builds the whole file before it answers; if no answer comes in 300 s, the command stops with exit 5.',
        'With --output, the path is checked before the request (missing parent directories are created, and the '
        + 'directory must be writable), so a bad path does not use up a download. The file is written atomically after '
        + 'a complete download and the old file stays on any failure; --json returns a summary {path, platform, '
        + 'sdk_version, bytes} instead of the file.',
        'Without --output, stdout is the server\'s bytes unchanged, in human mode and with --json alike; nothing else '
        + 'is printed there, and every error, the --json error object included, goes to stderr. A shell redirect '
        + '(`> file`) truncates the file before the request, and a download that breaks halfway leaves a partial one; '
        + 'Windows PowerShell 5.1 also re-encodes redirected output. Prefer --output.',
        'The command does not parse the file: a large one is hundreds of MB. It refuses an answer that is not '
        + 'application/json or does not start with { and end with } (fallback_invalid_response), and a connection that '
        + 'breaks during the download exits 5. To check the whole file in CI, run a JSON parser on it, for example '
        + '`jq empty ios_fallback.json`. Exit codes: 2 bad input, 3 no token or '
        + 'access refused, 4 any other API error (5xx, 429) or a refused answer, 5 the server was not reached or did '
        + 'not answer in 300 s, or the download broke, 1 the file could not be written.',
    ].join('\n\n');

    static override examples = [
        {
            description: 'Write the file; a failed download keeps the old file:',
            command: '<%= config.bin %> fallbacks get --app 550e8400-e29b-41d4-a716-446655440000 --platform ios --sdk-version 4.1.0 --output ios_fallback.json',
        },
        {
            description: 'In a POSIX shell, write the file to stdout:',
            command: '<%= config.bin %> fallbacks get --app 550e8400-e29b-41d4-a716-446655440000 --platform android --sdk-version 4.1.0 > android_fallback.json',
        },
    ];

    static override flags = {
        ...appIdFlag,
        'output': Flags.string({
            description: 'Write the file here instead of stdout; parent directories are created',
        }),
        'platform': Flags.option({
            description: 'Store the file is for: ios (App Store) or android (Play Store)',
            options: ['ios', 'android'] as const satisfies readonly Platform[],
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

    /**
     * Without --output stdout is the file, so the --json error object goes to stderr. Such a run returns
     * undefined, so an error is the only JSON that ever reaches this method there.
     */
    override logJson(json: unknown): void {
        if (flagPassed(this.argv, 'output')) {
            super.logJson(json);
        } else {
            writeJsonToStderr(json);
        }
    }

    async run(): Promise<undefined | Written> {
        const { flags } = await this.parse(FallbacksGet);
        const input = { platform: apiPlatform[flags.platform], sdkVersion: flags['sdk-version'] };
        const path = flags.output === undefined ? undefined : resolve(flags.output);
        // The token check comes before any change on disk
        const { fallbacks } = this.adapty;

        // A bad path fails here, before the request uses one of the app's hourly downloads
        if (path !== undefined) {
            await prepareDestination(path);
        }

        // One request, never retried (see the sdk resource); a 429 carries retry_after_seconds.
        const response = await fallbacks.get(flags.app, input).catch((error: unknown) => {
            throw explainHeadersTimeout(error);
        });

        // Before a byte goes anywhere: a refused answer touches neither stdout nor the destination
        await checkContentType(response);

        if (path === undefined) {
            await streamToStdout(checkShape(response.body));

            // undefined, so oclif prints no result under --json: the file on stdout is the result
            return undefined;
        }

        // The request has succeeded by now; the destination is touched only by the final rename of a
        // complete file, so any failure from here on keeps the old one.
        const bytes = await writeFileAtomic(path, checkShape(response.body));

        const written: Written = { bytes, path, platform: flags.platform, sdk_version: flags['sdk-version'] };

        this.render(written, renderWritten);

        return written;
    }
}
