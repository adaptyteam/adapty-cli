import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';

import type * as sinon from 'sinon';

export const US_HOST = 'https://api-admin.adapty.io/api/v1/developer';
export const EU_HOST = 'https://api-eu-admin.adapty.io/api/v1/developer';

/** Words that would tell a person about regions; a US user must meet none of them. */
export const REGION_WORDS = /\bregions?\b|\beu\b|ADAPTY_REGION|eu-login/i;

const ROOT = join(import.meta.dirname, '..', '..');

export const sessionPath = async (): Promise<string> => join((await Config.load(ROOT)).configDir, 'config.json');

/** The session file as a given CLI wrote it: `region` is left out for a file of an older CLI. */
export const writeSession = async (file: Record<string, unknown>): Promise<string> => {
    const path = await sessionPath();

    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, JSON.stringify(file), { mode: 0o600 });

    return path;
};

/** A login file cut short: not JSON any more. */
export const writeTruncatedSession = async (): Promise<string> => {
    const path = await sessionPath();

    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '{"access_token": "file-tok', { mode: 0o600 });

    return path;
};

/**
 * A login file without read permission (EACCES). Where the OS does not enforce the mode for this
 * user (root, or Windows, where chmod only sets the read-only flag) the file stays readable; there
 * the row falls back to a directory in place of the file, which fails the same read with EISDIR.
 * The fallback is named in the result, so a row says which read failure it met.
 */
export const writeUnreadableSession = async (): Promise<{ how: 'EACCES' | 'EISDIR'; path: string }> => {
    const path = await writeSession({ access_token: 'file-token', region: 'eu' });

    await chmod(path, 0o000);

    try {
        await readFile(path, 'utf8');
    } catch {
        return { how: 'EACCES', path };
    }

    await rm(path, { force: true });
    await mkdir(path, { recursive: true });

    return { how: 'EISDIR', path };
};

export const urlsOf = (stub: sinon.SinonStub): string[] => stub.getCalls().map(call => String(call.args[0]));

/** Every request went to the host, and there was at least one. */
export const allOn = (stub: sinon.SinonStub, host: string): boolean =>
    stub.callCount > 0 && urlsOf(stub).every(url => url.startsWith(`${host}/`));

export const bearerOf = (stub: sinon.SinonStub, index: number): string | undefined => {
    const init = stub.getCall(index).args[1] as RequestInit | undefined;

    return new Headers(init?.headers).get('authorization') ?? undefined;
};
