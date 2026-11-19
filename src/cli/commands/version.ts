import { Errors } from '@oclif/core';

import { throwIfAborted } from '../../sdk/core/clock.js';
import { BaseCommand } from '../base/base-command.js';

type Result = {
    installed: string;
    latest: null | string;
    update_available: boolean;
};

/** Always the public registry: a mirror in the npm settings may lag behind, or not hold the package. */
export const LATEST_URL = 'https://registry.npmjs.org/adapty/latest';

/** Long enough for a slow network, short enough that an agent waiting for the answer does not stall. */
export const TIME_LIMIT_MS = 3000;

export const UNKNOWN_LATEST = 'Could not check for a newer version.';

// The regular expression of semver.org (2.0.0), in parts. Build metadata is matched and ignored.
const CORE = String.raw`(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)`;
const PRERELEASE_ID = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)`;
const PRERELEASE = String.raw`(?:-(${PRERELEASE_ID}(?:\.${PRERELEASE_ID})*))?`;
const BUILD = String.raw`(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?`;
const SEMVER = new RegExp(`^${CORE}${PRERELEASE}${BUILD}$`);

type Parsed = { core: number[]; prerelease: string[] };

const parse = (version: string): Parsed | undefined => {
    const match = SEMVER.exec(version);

    if (!match) {
        return undefined;
    }

    const [, major, minor, patch, prerelease] = match;

    return {
        core: [Number(major), Number(minor), Number(patch)],
        prerelease: prerelease === undefined ? [] : prerelease.split('.'),
    };
};

export const isSemver = (version: string): boolean => parse(version) !== undefined;

const NUMERIC = /^\d+$/;

/** Semver 2.0.0, item 11.4: numbers by value and below words, words in ASCII order, a longer list after its prefix. */
const comparePrerelease = (left: string[], right: string[]): number => {
    if (left.length === 0 || right.length === 0) {
        // A release is newer than any prerelease of the same core version
        return Number(left.length === 0) - Number(right.length === 0);
    }

    for (const [index, a] of left.entries()) {
        const b = right[index];

        if (b === undefined) {
            break;
        }

        if (a === b) {
            continue;
        }

        const [aNumeric, bNumeric] = [NUMERIC.test(a), NUMERIC.test(b)];

        if (aNumeric && bNumeric) {
            return Number(a) - Number(b);
        }

        if (aNumeric !== bNumeric) {
            return aNumeric ? -1 : 1;
        }

        return a < b ? -1 : 1;
    }

    return left.length - right.length;
};

/** Whether `latest` is a newer version than `installed`, in semver order (0.10.0 is newer than 0.9.0). */
export const isNewer = (latest: string, installed: string): boolean => {
    const [a, b] = [parse(latest), parse(installed)];

    if (!a || !b) {
        return false;
    }

    // Major, minor, patch: the first part that differs decides
    const differs = a.core.map((part, index) => part - (b.core[index] ?? 0)).find(delta => delta !== 0);

    if (differs !== undefined) {
        return differs > 0;
    }

    return comparePrerelease(a.prerelease, b.prerelease) > 0;
};

/** What one registry read gave, and whether the time limit had to cut it off. */
type LatestRead = { latest: string | undefined; timedOut: boolean };

/**
 * The `version` of the `latest` dist-tag, or undefined when the registry could not say: no answer in the
 * time limit, a failed request, a status other than 200, or a body without a semver `version`.
 */
const readLatest = async (signal: AbortSignal): Promise<LatestRead> => {
    const timer = new AbortController();

    const timeout = setTimeout(() => {
        timer.abort();
    }, TIME_LIMIT_MS);

    const read = async (): Promise<string | undefined> => {
        const response = await fetch(LATEST_URL, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.any([signal, timer.signal]),
        });

        if (response.status !== 200) {
            return undefined;
        }

        const body: unknown = await response.json();
        const version = typeof body === 'object' && body !== null && 'version' in body ? body.version : undefined;

        return typeof version === 'string' && isSemver(version) ? version : undefined;
    };

    try {
        return { latest: await read(), timedOut: false };
    } catch {
        return { latest: undefined, timedOut: timer.signal.aborted };
    } finally {
        clearTimeout(timeout);
    }
};

/** How long after the command ends a stuck connection may still hold the process. */
export const EXIT_GRACE_MS = 100;

/**
 * Ends the process when a cut-off read still holds it open, once stdout and stderr are written.
 *
 * Node's fetch (undici) does not cancel a connection that is still being set up when its request is
 * aborted: a TLS handshake with a host that does not answer waits for undici's own connect limit (10 s),
 * and a CONNECT to a proxy that does not answer waits far longer. That socket keeps the process alive
 * after the output is out, and Node gives no public way to reach it, so the process is ended instead.
 * The timer is unref'd: when nothing else is open, the process ends by itself first and this never fires.
 */
const exitWhenStuck = (): void => {
    const flushThenExit = (): void => {
        process.stdout.write('', () => {
            process.stderr.write('', () => {
                // oclif's own way to end the process with a code, as its launcher does; ExitError prints nothing
                void Errors.handle(new Errors.ExitError(0));
            });
        });
    };

    setTimeout(flushThenExit, EXIT_GRACE_MS).unref();
};

export default class Version extends BaseCommand {
    #timedOut = false;

    static override description = [
        'Print the installed version of the CLI, and say when a newer one is on npm.',
        'Asks the public npm registry for the latest version, with a 3 s time limit. When the registry does not answer,',
        'the command still exits 0: --json gives "latest": null and "update_available": false.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> version',
        '<%= config.bin %> version --json',
    ];

    async run(): Promise<Result> {
        await this.parse(Version);

        const installed = this.config.version;

        // The --version line first, so a person sees it before the registry read
        this.render(this.config.userAgent, line => line);

        const { latest, timedOut } = await readLatest(this.signal);

        this.#timedOut = timedOut;

        // A Ctrl+C during the read is a cancelled command, not a registry that did not answer
        throwIfAborted(this.signal);

        const result: Result = {
            installed,
            latest: latest ?? null,
            update_available: latest !== undefined && isNewer(latest, installed),
        };

        if (latest === undefined) {
            if (!this.jsonEnabled()) {
                process.stderr.write(`${UNKNOWN_LATEST}\n`);
            }
        } else if (result.update_available) {
            this.render(latest, value => `A new version of adapty is available: ${value}. Update: npm i -g adapty@latest`);
        }

        return result;
    }

    protected override async finally(error: Error | undefined): Promise<unknown> {
        const done = await super.finally(error);

        // Armed here, not in run(): oclif prints the --json result after finally(). Only after a run that
        // ended well: a failed or cancelled run already exits through oclif with its own code
        if (error === undefined && this.#timedOut) {
            exitWhenStuck();
        }

        return done;
    }
}
