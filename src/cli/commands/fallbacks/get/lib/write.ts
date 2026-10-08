import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { CliError, errorCode } from '../../../../errors.js';

/**
 * The errno says where to look: a denied write, a full disk and a directory in the way are fixed in
 * different places. The original travels as `cause` only, as in the migration context store.
 */
const writeError = (path: string, cause: unknown): CliError => {
    const errno = errorCode(cause);
    const file = errno === undefined ? path : `${path} (${errno})`;

    return new CliError(
        `Could not write the fallback file: ${file}. Check the permissions and free space of its directory; the previous file is unchanged.`,
        1,
        'fallback_write_failed',
        { cause },
    );
};

/**
 * Stream `source` to `path` so that a reader sees the old file or the new one, never half of one: a
 * temp file in the same directory, then a rename onto the destination. On any failure the temp file
 * goes and the destination stays as it was. 0o644: the file is an app asset, not a secret.
 *
 * A failure of the source (a broken connection, a body that is not the file) is rethrown as it is,
 * with its own exit code; only a failure of the file system becomes `fallback_write_failed`.
 * Returns the number of bytes written.
 */
export const writeFileAtomic = async (path: string, source: AsyncIterable<Uint8Array>): Promise<number> => {
    const dir = dirname(path);
    const temporary = join(dir, `.${basename(path)}-${randomUUID()}.tmp`);
    const sourceFailure: { error?: unknown } = {};

    async function* watched(): AsyncGenerator<Uint8Array> {
        try {
            yield* source;
        } catch (error) {
            sourceFailure.error = error;
            throw error;
        }
    }

    try {
        await fs.mkdir(dir, { recursive: true });
        // Opened before the pipeline, not by createWriteStream: that opens in the background, and a
        // source failing first would let the cleanup below run before the temp file exists.
        const handle = await fs.open(temporary, 'wx', 0o644);

        await pipeline(watched(), handle.createWriteStream());

        const { size } = await fs.stat(temporary);

        await fs.rename(temporary, path);

        return size;
    } catch (error) {
        // Never remove the destination on failure: it holds the previous file.
        try {
            await fs.rm(temporary, { force: true });
        } catch {
            // Preserve the original error if cleanup also fails.
        }

        if ('error' in sourceFailure) {
            throw sourceFailure.error;
        }

        throw writeError(path, error);
    }
};
