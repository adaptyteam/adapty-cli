import { once } from 'node:events';

import { CliError, errorCode, exitCode } from '../errors.js';

/**
 * For a command whose stdout *is* a file, so that `> file` captures that file and nothing else. The
 * command still extends its product's base class: output style cuts across products, so it lives
 * here as plain functions, not as a base class or a BaseCommand mode.
 */

/**
 * Whether `--<name>` was passed, read from the raw argv rather than the parsed flags: it answers
 * before parsing and when parsing fails, which is when a command decides where its error goes.
 */
export const flagPassed = (argv: readonly string[], name: string): boolean => {
    const flag = `--${name}`;

    return argv.some(arg => arg === flag || arg.startsWith(`${flag}=`));
};

/** A Buffer, not the bare Uint8Array: a stream writer that stringifies its chunk would print "123,34". */
const asBuffer = (chunk: Uint8Array): Buffer => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

/**
 * The reader of stdout went away (`| head -c 10`): exit 5, as for a download that broke halfway on
 * stdout. Not a crash with a stack trace, and the download stops rather than run on into a dead pipe.
 */
const stdoutClosed = (cause: unknown): CliError => new CliError(
    `stdout was closed before the whole file was written${errorCode(cause) === undefined ? '' : ` (${errorCode(cause)})`}; the download was stopped.`,
    exitCode.network,
    'stdout_closed',
    { cause },
);

/**
 * Writes the chunks to stdout as they arrive, unchanged, and waits for `drain` whenever the pipe is
 * full, so memory stays flat whatever the size of the file. An error of stdout (EPIPE) ends the loop,
 * which cancels the source, and becomes `stdoutClosed`; the listener stays, for any later write error.
 */
export const streamToStdout = async (
    chunks: AsyncIterable<Uint8Array>,
    stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> => {
    const failure: { error?: unknown } = {};

    const onError = (error: unknown): void => {
        failure.error ??= error;
    };

    stdout.on('error', onError);

    for await (const chunk of chunks) {
        if (!stdout.write(asBuffer(chunk))) {
            await once(stdout, 'drain').catch(onError);
        }

        if ('error' in failure) {
            throw stdoutClosed(failure.error);
        }
    }
};

/**
 * The --json error object, pretty-printed as oclif prints it, but on stderr: on stdout it would land
 * in the file, before the first byte as after it. The exit code tells the caller the file is missing
 * or incomplete.
 */
export const writeJsonToStderr = (json: unknown, stderr: NodeJS.WritableStream = process.stderr): void => {
    stderr.write(`${JSON.stringify(json, null, 2)}\n`);
};
