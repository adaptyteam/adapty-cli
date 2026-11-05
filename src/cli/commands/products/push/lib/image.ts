import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { ValidationError } from '../../../../../sdk/core/errors.js';

const IMAGE_TYPES: Record<string, string> = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
};

/**
 * A PNG or JPEG file as a data URI. The type comes from the extension; the server checks the content. A file that
 * cannot be used is a ValidationError on `path`, the flag the file came from.
 */
export const readImageDataUri = async (file: string, path: string): Promise<string> => {
    const invalid = (message: string): never => {
        throw new ValidationError([{ message, path }]);
    };

    const type = IMAGE_TYPES[extname(file).toLowerCase()];

    if (type === undefined) {
        return invalid(`must be a .png, .jpg or .jpeg file, got "${file}"`);
    }

    let bytes: Buffer;

    try {
        bytes = await readFile(file);
    } catch (error) {
        return invalid(`cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (bytes.length === 0) {
        return invalid(`is an empty file: "${file}"`);
    }

    return `data:${type};base64,${bytes.toString('base64')}`;
};
