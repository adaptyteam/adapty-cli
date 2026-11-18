import { open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Args, Flags } from '@oclif/core';

import { RETENTION_IMAGE_MAX_BYTES, retentionModes } from '../../sdk/adapty/retention-messaging/index.js';
import { assertValid } from '../../sdk/core/validation.js';
import { CliError, exitCode } from '../errors.js';

import { uuidParser } from './uuid.js';

import type { ImageFile, MessageChange } from '../../sdk/adapty/retention-messaging/index.js';

/** The flags and arguments of the `retention-messaging` commands, and the files they read. */

export const modeFlag = (description: string) => ({
    mode: Flags.option({ description, options: retentionModes, required: true })(),
});

export const messageIdArg = {
    message_id: Args.string({
        description: 'Retention message ID (UUID)',
        parse: uuidParser('Invalid message ID format. Run `adapty retention-messaging messages list --app <app> --mode <mode>` to find it.'),
        required: true,
    }),
};

export const productIdArg = {
    product_id: Args.string({
        description: 'Product ID (UUID), the id of a product in `adapty retention-messaging products suggest`',
        parse: uuidParser('Invalid product ID format. Run `adapty retention-messaging products suggest --app <app>` to find it.'),
        required: true,
    }),
};

export const suggestFlags = {
    limit: Flags.integer({ description: 'How many suggestions to return', min: 1 }),
    search: Flags.string({ description: 'Only the suggestions that match this text' }),
};

const cannotRead = (path: string, cause: unknown): CliError =>
    new CliError(`Cannot read file: ${path}`, exitCode.usage, undefined, { cause });

/**
 * An image as the checks need it. At most one byte past the size limit is read: that is enough to
 * refuse a longer file on its size, and a huge file is never read in full.
 */
export const readImage = async (path: string, base = '.'): Promise<ImageFile> => {
    try {
        const handle = await open(resolve(base, path), 'r');

        try {
            const { size } = await handle.stat();
            const bytes = new Uint8Array(Math.min(size, RETENTION_IMAGE_MAX_BYTES + 1));
            const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);

            return { bytes: bytes.subarray(0, bytesRead), name: path };
        } finally {
            await handle.close();
        }
    } catch (error) {
        throw cannotRead(path, error);
    }
};

/** The folder that the `image_path` of a file is relative to: the folder of the file, or the current one for stdin. */
export const fileFolder = (file: string | undefined): string => (file === undefined || file === '-' ? '.' : dirname(file));

export const readIcons = async (paths: readonly string[], base: string): Promise<ImageFile[]> =>
    Promise.all(paths.map(path => readImage(path, base)));

export type ChangeFlags = {
    'alt-text'?: string | undefined;
    'body'?: string | undefined;
    'name'?: string | undefined;
    'remove-image': boolean;
    'title'?: string | undefined;
};

const FIELD_FLAGS = [['name', 'name'], ['title', 'title'], ['body', 'body'], ['alt-text', 'alt_text']] as const;

/**
 * The change file with the field flags put in. A field given both as a flag and in the file is
 * refused rather than one of them winning in silence.
 */
export const changeFromInput = (file: MessageChange, flags: ChangeFlags): MessageChange => {
    const issues = FIELD_FLAGS.filter(([flag, key]) => flags[flag] !== undefined && file[key] !== undefined)
        .map(([flag, key]) => ({ message: `--${flag} and ${key} in the change file are both given: give it once` }));

    if (flags['remove-image'] && file.remove_image !== undefined) {
        issues.push({ message: '--remove-image and remove_image in the change file are both given: give it once' });
    }

    assertValid(issues);

    return {
        ...file,
        ...Object.fromEntries(FIELD_FLAGS.flatMap(([flag, key]) => (flags[flag] === undefined
            ? []
            : [[key, flags[flag]]]))),
        ...(flags['remove-image'] ? { remove_image: true } : {}),
    };
};
