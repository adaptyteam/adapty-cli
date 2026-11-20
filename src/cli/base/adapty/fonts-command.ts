import { fontConflict } from '../../../sdk/adapty/index.js';
import { ApiError, isSdkError } from '../../../sdk/core/errors.js';
import { CliError, exitCode, toCliError } from '../../errors.js';

import { AdaptyCommand } from './adapty-command.js';

import type { FontConflict, FontFile, FontUploadResult, UploadChoice } from '../../../sdk/adapty/index.js';

/** A file of a package: what it did, why the server refused it, or that it was never sent. */
export type FontFileReport
    = | (FontUploadResult & { file: string })
        | {
            choices?: UploadChoice[] | undefined;
            conflict?: FontConflict | undefined;
            /** Every colliding stored face; `conflict` is the first. */
            conflicts?: FontConflict[] | undefined;
            error_code: string;
            file: string;
            message: string;
            next_step?: string | undefined;
            result: 'refused';
            status_code: number;
        }
        | { error_code: string; file: string; message: string; result: 'failed' }
        | { file: string; result: 'not_sent' };

/** Why the flows of a saved change could not be read, and how to read them. */
export type FlowsToPublishError = { error_code: string; message: string; next_step: string };

/**
 * `null`: the change is saved, but which flows use it could not be read; `flows_to_publish_error` says
 * why (also under --json, where a warning is not printed).
 */
export type FlowsToPublish = {
    flows_to_publish: null | string[];
    flows_to_publish_error?: FlowsToPublishError | undefined;
};

export type FontPackageReport = FlowsToPublish & { files: FontFileReport[] };

/** How to send the same file again: the command the next step of a refusal names. */
export type RetryCommand = (path: string) => string;

type PackageFile = FontFile & { path: string };

/**
 * The families a stored file changed: of every face it created or replaced, in any family (an iOS name
 * collision can replace a face of another family). Kept faces did not change.
 */
const changedFamilies = (reports: readonly FontFileReport[]): string[] => [...new Set(reports.flatMap(report => ('family' in report
    ? [...report.created_faces, ...report.replaced_faces].map(face => face.family_id)
    : [])))];

/** A path as one shell word: quoted when it has more than safe characters, and never read as a flag. */
export const shellWord = (path: string): string => {
    const safe = path.startsWith('-') ? `./${path}` : path;

    return /^[\w./@%+=:,-]+$/.test(safe) ? safe : `'${safe.replaceAll('\'', String.raw`'\''`)}'`;
};

const nextStep = (error: ApiError, path: string, retry: RetryCommand): string | undefined => {
    const refusal = fontConflict(error);

    if (refusal !== undefined) {
        const faces = refusal.conflicts.length === 1 ? 'that face' : `all ${refusal.conflicts.length} of those faces`;

        const command = retry(shellWord(path));

        return `Run \`${command} --choice replace\` to put the file on ${faces}, `
            + `or \`${command} --choice keep\` to skip it.`;
    }

    return error.code === 'font_faces_already_exist'
        ? 'Every face of this file is in the family already. Replace the file of a face with `adapty fonts faces replace`.'
        : undefined;
};

const refused = (error: ApiError, path: string, retry: RetryCommand): FontFileReport => {
    const refusal = fontConflict(error);

    return {
        choices: refusal?.choices,
        conflict: refusal?.conflict,
        conflicts: refusal?.conflicts,
        error_code: error.code ?? `http_${error.status}`,
        file: path,
        message: error.message,
        next_step: nextStep(error, path, retry),
        result: 'refused',
        status_code: error.status,
    };
};

/**
 * `AdaptyCommand` plus what the `fonts` commands share: the per-file report of a package, and the flows
 * that need a publish after a change of a family they use.
 */
export abstract class FontsCommand extends AdaptyCommand {
    /**
     * The flows that use any of these families. The change is already saved, so a failed read is a
     * warning and `null`, never an empty list; under --json the reason is in the answer and on stderr. An
     * answer without its lists exits 4, as every missing field does; another failure leaves the exit code.
     */
    protected async flowsToPublish(appId: string, familyIds: readonly string[]): Promise<FlowsToPublish> {
        if (familyIds.length === 0) {
            return { flows_to_publish: [] };
        }

        try {
            return { flows_to_publish: await this.adapty.fonts.flowsUsing(appId, familyIds) };
        } catch (error) {
            if (isSdkError(error) && error.kind === 'cancelled') {
                throw error;
            }

            const mapped = toCliError(error);
            const code = mapped instanceof CliError ? mapped.json.code ?? 'unknown_error' : 'unknown_error';
            const nextStep = `Run \`adapty fonts usage --app ${appId} FAMILY_ID\` for each changed family to see them.`;
            const text = `The change is saved, but the flows that use the family could not be read: ${mapped.message}\n${nextStep}`;

            if (this.jsonEnabled()) {
                process.stderr.write(`Warning: ${text}\n`);
            } else {
                this.warn(text);
            }

            if (code === 'malformed_response' && (process.exitCode ?? 0) === 0) {
                process.exitCode = exitCode.api;
            }

            const reason = { error_code: code, message: mapped.message, next_step: nextStep };

            return { flows_to_publish: null, flows_to_publish_error: reason };
        }
    }

    /**
     * Sends the files one by one. A file the server refuses does not stop the rest. A network failure, a
     * missing or rejected token (401) and a refused authorization (403) stop the package: the files after
     * it are reported as not sent. Exit 4 when a file was refused, 5 on a network failure, 3 on an auth
     * failure (as every command classifies them), 0 when every file was stored.
     */
    protected async sendPackage(
        files: readonly PackageFile[],
        send: (file: FontFile) => Promise<FontUploadResult>,
        context: { appId: string; retry: RetryCommand },
    ): Promise<FontPackageReport> {
        const reports: FontFileReport[] = [];
        let stop: CliError | undefined;

        for (const [index, file] of files.entries()) {
            try {
                reports.push({ ...(await send(file)), file: file.path });
            } catch (error) {
                stop = stopping(error);

                if (stop === undefined) {
                    reports.push(refused(error as ApiError, file.path, context.retry));
                    continue;
                }

                const code = stop.json.code ?? 'unknown_error';

                // A success the CLI cannot read may have stored the file: say so, never call it refused
                const message = code === 'malformed_response'
                    ? `${stop.message} The file may be stored: check \`adapty fonts list --app ${context.appId}\` before sending it again.`
                    : stop.message;

                reports.push({ error_code: code, file: file.path, message, result: 'failed' });
                reports.push(...files.slice(index + 1).map(rest => ({ file: rest.path, result: 'not_sent' as const })));
                break;
            }
        }

        const refusedAny = reports.some(report => report.result === 'refused');

        process.exitCode = stop?.exitCode ?? (refusedAny ? exitCode.api : undefined);

        return { files: reports, ...(await this.packageFlows(stop, context.appId, reports)) };
    }

    /**
     * After an auth stop the usage read would be refused the same way, and after a success answer the CLI
     * could not read it is not known what the file changed: unknown in both cases, never a short list.
     */
    private async packageFlows(
        stop: CliError | undefined,
        appId: string,
        reports: readonly FontFileReport[],
    ): Promise<FlowsToPublish> {
        if (stop?.exitCode === exitCode.auth) {
            return { flows_to_publish: null };
        }

        if (stop?.json.code === 'malformed_response') {
            return {
                flows_to_publish: null,
                flows_to_publish_error: {
                    error_code: 'malformed_response',
                    message: 'A file may be stored from an answer the CLI could not read, so the changed font families are not known.',
                    next_step: `Run \`adapty fonts list --app ${appId}\` to see the families, then \`adapty fonts usage --app ${appId} FAMILY_ID\` for each changed one.`,
                },
            };
        }

        return this.flowsToPublish(appId, changedFamilies(reports));
    }
}

/**
 * The failure that stops a package, as a CLI error with its exit code; undefined for a refusal of the
 * file itself. A success answer the CLI cannot read stops it too: the file may be stored. Anything else
 * (a cancel, a bug) is thrown on.
 */
const stopping = (error: unknown): CliError | undefined => {
    if (error instanceof ApiError && error.status !== 403 && error.code !== 'malformed_response') {
        return undefined;
    }

    const stoppedBy = error instanceof ApiError || (isSdkError(error) && (error.kind === 'network' || error.kind === 'auth_required'));

    if (!stoppedBy) {
        throw error;
    }

    const mapped = toCliError(error);

    if (!(mapped instanceof CliError)) {
        throw error;
    }

    return mapped;
};
