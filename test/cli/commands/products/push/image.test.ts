import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'chai';

import { readImageDataUri } from '../../../../../src/cli/commands/products/push/lib/image.js';
import { ValidationError } from '../../../../../src/sdk/core/errors.js';
import { rejection } from '../../../../helpers/rejection.js';

const issue = async (promise: Promise<unknown>): Promise<string> => {
    const error = await rejection(promise);

    expect(error).to.be.instanceOf(ValidationError);

    return (error as ValidationError).issues.map(item => `${item.path}: ${item.message}`).join('; ');
};

describe('readImageDataUri', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'adapty-image-'));
    });

    afterEach(async () => {
        await rm(dir, { force: true, recursive: true });
    });

    it('reads a file as a data URI typed by its extension, in any case', async () => {
        const file = join(dir, 'shot.JPG');
        await writeFile(file, 'abc');

        expect(await readImageDataUri(file, 'screenshot')).to.equal('data:image/jpeg;base64,YWJj');
    });

    it('refuses another extension before reading, on the given flag', async () => {
        expect(await issue(readImageDataUri(join(dir, 'missing.gif'), 'screenshot'))).to.match(/^screenshot: must be a \.png/);
    });

    it('refuses a file it cannot read and an empty file', async () => {
        const empty = join(dir, 'empty.png');
        await writeFile(empty, '');

        expect(await issue(readImageDataUri(join(dir, 'missing.png'), 'image'))).to.match(/^image: cannot be read: /);
        expect(await issue(readImageDataUri(empty, 'image'))).to.match(/^image: is an empty file/);
    });
});
