import { readFile } from 'node:fs/promises';

import { usageError } from '../errors.js';

const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString('utf8');
};

/** `label` names the source in the error: the flag, or the path of the file. */
export const parseJson = (raw: string, label: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw usageError(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/** The JSON of a file, or of stdin for `-`. */
export const readJsonFile = async (path: string): Promise<unknown> => {
    let raw: string;

    try {
        raw = path === '-' ? await readStdin() : await readFile(path, 'utf8');
    } catch {
        throw usageError(`Could not read ${path}.`);
    }

    return parseJson(raw, path);
};

/** The body of a write as `get --json` printed it. It is sent as it is, so it must be an object. */
export const readBodyFile = async (path: string): Promise<Record<string, unknown>> => {
    const body = await readJsonFile(path);

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw usageError(`${path} must hold a JSON object.`);
    }

    return body as Record<string, unknown>;
};
