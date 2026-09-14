/** Fakes for the sdk and its consumers: cli, MCP and any other adapter test with the same tools. */
import { throwIfAborted } from './clock.js';

import type { Clock } from './clock.js';

export type FakeClock = {
    advance(ms: number): void;
    /** Durations of every sleep, in order. */
    readonly sleeps: number[];
} & Clock;

/** A clock whose sleep moves time forward instantly. */
export const createFakeClock = (start = 0): FakeClock => {
    let time = start;
    const sleeps: number[] = [];

    return {
        sleeps,
        now: () => time,

        advance: (ms) => {
            time += ms;
        },

        sleep: (ms, signal) => {
            throwIfAborted(signal);
            sleeps.push(ms);
            time += ms;

            return Promise.resolve();
        },
    };
};

export type ScriptedResponse = {
    body?: unknown;
    headers?: Record<string, string>;
    status?: number;
};

export type RecordedCall = {
    body: string | undefined;
    headers: Headers;
    method: string;
    url: string;
};

export type ScriptedFetch = {
    calls: RecordedCall[];
    fetch: typeof globalThis.fetch;
};

/** Answers with the scripted responses in order; an Error in the script is thrown, as fetch would. */
export const createScriptedFetch = (script: readonly (Error | ScriptedResponse)[]): ScriptedFetch => {
    const queue = [...script];
    const calls: RecordedCall[] = [];

    const fetch: typeof globalThis.fetch = (input, init) => {
        calls.push({
            body: typeof init?.body === 'string' ? init.body : undefined,
            headers: new Headers(init?.headers),
            method: init?.method ?? 'GET',
            url: String(input instanceof Request ? input.url : input),
        });

        const next = queue.shift();

        if (next === undefined) {
            return Promise.reject(new Error(`scripted fetch: no response for call #${calls.length}`));
        }

        if (next instanceof Error) {
            return Promise.reject(next);
        }

        // ResponseInit.headers is readonly in @types/node, so the init is built in one go
        const status = next.status ?? 200;
        const responseInit: ResponseInit = next.headers ? { headers: next.headers, status } : { status };

        const body = next.body === undefined ? null : JSON.stringify(next.body);

        return Promise.resolve(new Response(body, responseInit));
    };

    return { calls, fetch };
};
