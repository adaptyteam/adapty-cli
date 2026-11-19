import { mkdir, writeFile } from 'node:fs/promises';
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

/** A file that is there but cannot be read as one: a directory in its place, the same on every OS. */
export const writeUnreadableSession = async (): Promise<string> => {
    const path = await sessionPath();

    await mkdir(path, { recursive: true });

    return path;
};

export const urlsOf = (stub: sinon.SinonStub): string[] => stub.getCalls().map(call => String(call.args[0]));

/** Every request went to the host, and there was at least one. */
export const allOn = (stub: sinon.SinonStub, host: string): boolean =>
    stub.callCount > 0 && urlsOf(stub).every(url => url.startsWith(`${host}/`));

export const bearerOf = (stub: sinon.SinonStub, index: number): string | undefined => {
    const init = stub.getCall(index).args[1] as RequestInit | undefined;

    return new Headers(init?.headers).get('authorization') ?? undefined;
};
