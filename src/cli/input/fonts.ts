import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { Args, Flags } from '@oclif/core';

import { uploadChoices } from '../../sdk/adapty/index.js';
import { CliError, exitCode } from '../errors.js';

import { uuidParser } from './uuid.js';

import type { FontFile, UploadChoice, UploadDecision } from '../../sdk/adapty/index.js';

/** The arguments and flags of the `fonts` commands, and the files they send. */

/** A font id in lowercase, as the server writes it and its routes take it; any case is accepted. */
const fontIdParser = (hint: string) => {
    const parse = uuidParser(hint);

    return async (input: string): Promise<string> => (await parse(input)).toLowerCase();
};

const FAMILY_HINT = 'Invalid font family ID format. Run `adapty fonts list --app <app>` to find it.';
const FACE_HINT = 'Invalid font face ID format. Run `adapty fonts list --app <app>` to find it.';

/** The target family of a move. */
export const familyIdFlag = (description: string) => ({
    to: Flags.string({ description, parse: fontIdParser(FAMILY_HINT), required: true }),
});

export const familyIdArg = {
    family_id: Args.string({
        description: 'Font family ID (UUID), as `fonts list` shows it',
        parse: fontIdParser(FAMILY_HINT),
        required: true,
    }),
};

export const faceIdArg = {
    face_id: Args.string({
        description: 'Font face ID (UUID), as `fonts list` shows it',
        parse: fontIdParser(FACE_HINT),
        required: true,
    }),
};

/** How a collision is decided: a choice, and for the retry that a refusal prints, the faces it showed. */
export const choiceFlag = {
    'choice': Flags.string({
        description: 'When a file collides with stored faces: replace puts the file on all of them, keep skips the file',
        options: [...uploadChoices],
    }),
    'replace-face-id': Flags.string({
        delimiter: ',',
        description: 'With --choice replace and one file: replace exactly these faces (comma-separated or repeatable), '
            + 'the ones a refusal showed. The server refuses a replace when those faces no longer match the collisions.',
        multiple: true,
        multipleNonGreedy: true,
        parse: fontIdParser(FACE_HINT),
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

/**
 * The decision of a package: `--replace-face-id` binds `--choice replace` to the faces one file collides with, so
 * it needs both; a bare choice stays as it is.
 */
export const choiceValue = (
    flags: { 'choice'?: string | undefined; 'replace-face-id'?: string[] | undefined },
    files: number,
): UploadDecision | undefined => {
    const faceIds = flags['replace-face-id'] ?? [];

    if (faceIds.length === 0) {
        return flags.choice as UploadChoice | undefined;
    }

    if (flags.choice !== 'replace') {
        throw new CliError('--replace-face-id names the faces to replace: give it with --choice replace.', exitCode.usage);
    }

    if (files !== 1) {
        throw new CliError('--replace-face-id names the faces that one file collides with: give one file with it.', exitCode.usage);
    }

    return { replaceFaceIds: faceIds };
};

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
