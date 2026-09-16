import { readFileSync } from 'node:fs';

import { validateActionInput } from '../../../../../sdk/adapty/migrations/index.js';
import { ValidationError } from '../../../../../sdk/core/errors.js';
import { assertValid } from '../../../../../sdk/core/validation.js';

type InputFlags = {
    'input'?: string | undefined;
    'input-file'?: string | undefined;
};

/** CLI error formatting maps inputFile to --input-file. */
const invalid = (path: string, message: string): never => {
    throw new ValidationError([{ message, path }]);
};

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const parseJson = (raw: string, path: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch (error) {
        return invalid(path, `is not valid JSON: ${reason(error)}`);
    }
};

const readFile = (path: string): string => {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        return invalid('inputFile', `cannot be read: ${reason(error)}`);
    }
};

const readStdin = async (): Promise<string> => {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString('utf8');
};

const parseActionInput = async (flags: InputFlags): Promise<unknown> => {
    if (flags.input !== undefined) {
        return parseJson(flags.input, 'input');
    }

    const path = flags['input-file'];

    if (path === undefined) {
        return undefined;
    }

    return parseJson(path === '-' ? await readStdin() : readFile(path), 'inputFile');
};

/**
 * Read inline JSON, a file, or stdin, and answer with an input the action request accepts.
 * The caller checks the action kind before waiting on stdin.
 */
export const readActionInput = async (flags: InputFlags): Promise<unknown> => {
    const input = await parseActionInput(flags);

    assertValid(validateActionInput(input));

    return input;
};
