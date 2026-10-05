import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

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
 * Write `content` to `path` so that a reader sees the old file or the new one, never half of one: a
 * temp file in the same directory, then a rename onto the destination. On any failure the temp file
 * goes and the destination stays as it was. 0o644: the file is an app asset, not a secret.
 */
export const writeFileAtomic = async (path: string, content: string): Promise<void> => {
    const dir = dirname(path);
    const temporary = join(dir, `.${basename(path)}-${randomUUID()}.tmp`);

    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
        await fs.rename(temporary, path);
    } catch (error) {
        // Never remove the destination on failure: it holds the previous file.
        try {
            await fs.rm(temporary, { force: true });
        } catch {
            // Preserve the write error if cleanup also fails.
        }

        throw writeError(path, error);
    }
};
