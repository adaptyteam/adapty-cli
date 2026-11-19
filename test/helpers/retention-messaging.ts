import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { run } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import * as sinon from 'sinon';

import { TEST_APP_ID, TEST_RESOURCE_ID } from './mock-fetch.js';

/** What the `retention-messaging` command tests share: a scripted server, a terminal, files and fixtures. */

const ROOT = join(import.meta.dirname, '..', '..');

export const APP = TEST_APP_ID;
export const MESSAGE = TEST_RESOURCE_ID;
export const BASE = `/apps/${APP}/retention-messaging`;
export const API = 'https://api-admin.adapty.io/api/v1/developer';

export const runCli = (args: readonly string[]) => captureOutput(async () => run([...args], { root: ROOT }));

/** One answer of the scripted server: a status and a body, or a network failure. */
export type Answer = 'network' | { body?: unknown; status?: number };

export const serve = (answers: readonly Answer[]): sinon.SinonStub => {
    let index = 0;

    return sinon.stub(globalThis, 'fetch').callsFake(() => {
        const answer = answers[index] ?? answers.at(-1) ?? {};

        index += 1;

        if (answer === 'network') {
            return Promise.reject(new TypeError('fetch failed'));
        }

        const status = answer.status ?? 200;

        return Promise.resolve(status === 204
            ? new Response(null, { status })
            : new Response(JSON.stringify(answer.body ?? {}), { headers: { 'content-type': 'application/json' }, status }));
    });
};

export type Sent = { body: unknown; method: string; path: string; query: URLSearchParams };

/** Every request the command sent, in order. */
export const sent = (stub: sinon.SinonStub): Sent[] => stub.getCalls().map((call) => {
    const [url, init] = call.args as [string, RequestInit];
    const parsed = new URL(url);

    return { body: init.body, method: init.method ?? 'GET', path: parsed.pathname.replace('/api/v1/developer', ''), query: parsed.searchParams };
});

export const writes = (stub: sinon.SinonStub): Sent[] => sent(stub).filter(request => request.method !== 'GET');

/** The JSON body of a multipart write, the `data` part. */
export const formData = (request: Sent | undefined): unknown => JSON.parse((request?.body as FormData).get('data') as string);

/**
 * Whether a person is at a terminal is decided by the real streams, so a test says it for itself. Node
 * deletes isTTY on a pipe rather than setting it false, so the property is put back the way it was found.
 */
export const useStreams = ({ terminal, typed }: { terminal: boolean; typed?: string }): (() => void) => {
    const stdout = process.stdout as { isTTY?: boolean | undefined };
    const hadStdout = Object.hasOwn(stdout, 'isTTY');
    const wasTty = stdout.isTTY;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const input = Object.assign(new PassThrough(), { isTTY: terminal });

    stdout.isTTY = terminal;
    input.end(typed === undefined ? undefined : `${typed}\n`);
    Object.defineProperty(process, 'stdin', { configurable: true, value: input });

    return () => {
        if (hadStdout) {
            stdout.isTTY = wasTty;
        } else {
            delete stdout.isTTY;
        }

        if (stdinDescriptor) {
            Object.defineProperty(process, 'stdin', stdinDescriptor);
        }
    };
};

/** A temporary folder for the files of one test. */
type TempFolder = {
    path: (name: string) => string;
    remove: () => Promise<void>;
    write: (name: string, content: string | Uint8Array) => Promise<string>;
};

export const tempFolder = async (): Promise<TempFolder> => {
    const dir = await mkdtemp(join(tmpdir(), 'adapty-retention-'));

    return {
        path: name => join(dir, name),
        remove: () => rm(dir, { force: true, recursive: true }),
        write: async (name, content) => {
            const file = join(dir, name);

            await writeFile(file, typeof content === 'string' ? content : Buffer.from(content));

            return file;
        },
    };
};

const localization = (locale: string, title: string, body: string, texts: readonly string[]) => ({
    body,
    bullet_points: texts.map(text => ({ text })),
    locale,
    status: 'live',
    title,
});

/** A default message: three localizations, an image, two bullet points with icons and two products. */
export const defaultMessage = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    body: 'Body',
    bullet_points: [
        { alt_text: 'Icon one', bullet_id: 'b1', image: { file_name: 'one.png', image_id: 'i1', url: 'https://cdn/one.png' }, text: 'One' },
        { alt_text: null, bullet_id: 'b2', image: { file_name: 'two.png', image_id: 'i2', url: 'https://cdn/two.png' }, text: 'Two' },
    ],
    header_position: 'above_body',
    image: { alt_text: 'Header alt', file_name: 'header.png', url: 'https://cdn/header.png' },
    localizations: [
        localization('de-DE', 'Titel', 'Text', ['Eins', 'Zwei']),
        localization('fr-FR', 'Titre', 'Texte', ['Un', 'Deux']),
        localization('es-ES', 'Titulo', 'Texto', ['Uno', 'Dos']),
    ],
    message_id: MESSAGE,
    name: 'Winter',
    products: [
        { association: null, id: 'p1', period: 'P1Y', store_id: 'annual', title: 'Annual' },
        { association: null, id: 'p2', period: 'P1M', store_id: 'monthly', title: 'Monthly' },
    ],
    state: 'live',
    title: 'Title',
    type: 'default',
    ...overrides,
});

/** The full body of an update of `defaultMessage` that changes nothing. */
export const defaultBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    alt_text: 'Header alt',
    body: 'Body',
    bullet_points: [{ alt_text: 'Icon one', bullet_id: 'b1', text: 'One' }, { alt_text: null, bullet_id: 'b2', text: 'Two' }],
    localizations: [
        { body: 'Text', bullet_points: [{ text: 'Eins' }, { text: 'Zwei' }], locale: 'de-DE', title: 'Titel' },
        { body: 'Texte', bullet_points: [{ text: 'Un' }, { text: 'Deux' }], locale: 'fr-FR', title: 'Titre' },
        { body: 'Texto', bullet_points: [{ text: 'Uno' }, { text: 'Dos' }], locale: 'es-ES', title: 'Titulo' },
    ],
    name: 'Winter',
    products: [{ store_id: 'annual' }, { store_id: 'monthly' }],
    remove_image: false,
    title: 'Title',
    ...overrides,
});

/** A promo message: two localizations, no image, no bullet points, one product with a promo offer. */
export const promoMessage = (): Record<string, unknown> => defaultMessage({
    bullet_points: [],
    image: null,
    localizations: [localization('de-DE', 'Titel', 'Text', []), localization('fr-FR', 'Titre', 'Texte', [])],
    products: [{
        association: { id: 'o1', store_id: 'promo.half', title: 'Half price', type: 'promo_offer' },
        id: 'p1',
        period: 'P1Y',
        store_id: 'annual',
        title: 'Annual',
    }],
    type: 'promo',
});

export const promoBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    alt_text: null,
    body: 'Body',
    bullet_points: [],
    localizations: [
        { body: 'Text', bullet_points: [], locale: 'de-DE', title: 'Titel' },
        { body: 'Texte', bullet_points: [], locale: 'fr-FR', title: 'Titre' },
    ],
    name: 'Winter',
    products: [{ association: { store_id: 'promo.half', type: 'promo_offer' }, store_id: 'annual' }],
    remove_image: false,
    title: 'Title',
    ...overrides,
});
