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

/** `null`: the change is saved, but which flows use it could not be read (a warning says why). */
export type FlowsToPublish = { flows_to_publish: null | string[] };

export type FontPackageReport = FlowsToPublish & { files: FontFileReport[] };

/** How to send the same file again: the command the next step of a refusal names. */
export type RetryCommand = (path: string) => string;

type PackageFile = FontFile & { path: string };

/** A file that went into a family that existed before: the flows of that family need a publish. */
const CHANGED = new Set<string>(['added', 'partly_added', 'replaced']);

const nextStep = (error: ApiError, path: string, retry: RetryCommand): string | undefined => {
    const refusal = fontConflict(error);

    if (refusal !== undefined) {
        const faces = refusal.conflicts.length === 1 ? 'that face' : `all ${refusal.conflicts.length} of those faces`;

        return `Run \`${retry(path)} --choice replace\` to put the file on ${faces}, `
            + `or \`${retry(path)} --choice keep\` to skip it.`;
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
     * warning and `null`, never an empty list.
     */
    protected async flowsToPublish(appId: string, familyIds: readonly string[]): Promise<null | string[]> {
        if (familyIds.length === 0) {
            return [];
        }

        try {
            return await this.adapty.fonts.flowsUsing(appId, familyIds);
        } catch (error) {
            if (isSdkError(error) && error.kind === 'cancelled') {
                throw error;
            }

            this.warn(`The change is saved, but the flows that use the family could not be read: ${toCliError(error).message}\n`
                + `Run \`adapty fonts usage --app ${appId} FAMILY_ID\` to see them.`);

            return null;
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

                reports.push({ error_code: code, file: file.path, message: stop.message, result: 'failed' });
                reports.push(...files.slice(index + 1).map(rest => ({ file: rest.path, result: 'not_sent' as const })));
                break;
            }
        }

        const changed = reports.flatMap(report =>
            ('family' in report && report.family !== null && CHANGED.has(report.result) ? [report.family.id] : []));

        const refusedAny = reports.some(report => report.result === 'refused');

        process.exitCode = stop?.exitCode ?? (refusedAny ? exitCode.api : undefined);

        // After an auth stop the usage read would be refused the same way: unknown, not read
        const flows = stop?.exitCode === exitCode.auth ? null : await this.flowsToPublish(context.appId, changed);

        return { files: reports, flows_to_publish: flows };
    }
}

/**
 * The failure that stops a package, as a CLI error with its exit code; undefined for a refusal of the
 * file itself. Anything else (a cancel, a bug) is thrown on.
 */
const stopping = (error: unknown): CliError | undefined => {
    if (error instanceof ApiError && error.status !== 403) {
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
