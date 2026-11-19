import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { Args, Flags } from '@oclif/core';

import { uploadChoices } from '../../sdk/adapty/index.js';
import { CliError, exitCode } from '../errors.js';

import { uuidParser } from './uuid.js';

import type { FontFile, UploadChoice } from '../../sdk/adapty/index.js';

/** The arguments and flags of the `fonts` commands, and the files they send. */

export const familyIdArg = {
    family_id: Args.string({
        description: 'Font family ID (UUID), as `fonts list` shows it',
        parse: uuidParser('Invalid font family ID format. Run `adapty fonts list --app <app>` to find it.'),
        required: true,
    }),
};

export const faceIdArg = {
    face_id: Args.string({
        description: 'Font face ID (UUID), as `fonts list` shows it',
        parse: uuidParser('Invalid font face ID format. Run `adapty fonts list --app <app>` to find it.'),
        required: true,
    }),
};

export const choiceFlag = {
    choice: Flags.string({
        description: 'When a file collides with a stored face: replace puts the file on that face, keep skips the file',
        options: [...uploadChoices],
    }),
};

/** Weight and italic name one face of a font, so they are given together. */
export const pairFlags = {
    italic: Flags.string({
        dependsOn: ['weight'],
        description: 'Italic (true) or upright (false); give it with --weight',
        options: ['true', 'false'],
    }),
    weight: Flags.integer({
        dependsOn: ['italic'],
        description: 'Font weight, such as 400 for regular or 700 for bold; give it with --italic',
    }),
};

export const italicValue = (value: string | undefined): boolean | undefined =>
    (value === undefined ? undefined : value === 'true');

export const choiceValue = (value: string | undefined): UploadChoice | undefined => value as UploadChoice | undefined;

/** A file of a package, with the path the user gave: the report names each file by it. */
export type FontFileInput = FontFile & { path: string };

export const readFontFile = async (path: string): Promise<FontFileInput> => {
    const content = await readFile(path).catch((error: unknown) => {
        throw new CliError(`Cannot read file: ${path}`, exitCode.usage, undefined, { cause: error });
    });

    return { content, name: basename(path), path };
};

/** Every file is read before the first is sent: a wrong path stops the package with nothing sent. */
export const readFontFiles = async (paths: readonly string[]): Promise<FontFileInput[]> =>
    Promise.all(paths.map(path => readFontFile(path)));
