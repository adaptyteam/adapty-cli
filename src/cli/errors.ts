import { Errors } from '@oclif/core';

import { isSdkError } from '../sdk/core/errors.js';

import { wizardDiagnostics, wizardErrorMessage } from './errors/wizard.js';

import type { WizardDiagnostics } from './errors/wizard.js';
import type { Issue } from '../sdk/core/errors.js';

/**
 * Exit codes are the adapter's business: sdk errors carry none.
 *   2  usage     — the input is wrong (oclif's own parse errors exit 2 as well)
 *   3  auth      — no token, an expired one, or a refused authorization
 *   4  api       — the server rejected a well-formed request
 *   5  network   — the server was never reached
 *   6  confirm   — nothing was done: the action changes production data and wants --yes
 * 130  cancelled — Ctrl+C, by the shell convention 128 + SIGINT
 */
export const exitCode = {
    api: 4,
    auth: 3,
    cancelled: 130,
    confirmRequired: 6,
    network: 5,
    usage: 2,
} as const;

/** HTTP status is separate from the process exit code. Snake_case fields preserve the old JSON contract. */
export type ErrorJson = WizardDiagnostics & {
    code?: string | undefined;
    error_code?: string | undefined;
    errors?: unknown;
    message: string;
    status?: number | undefined;
    status_code?: number | undefined;
};

export type CliErrorOptions = {
    /**
     * The failure this error explains. It is not printed and not serialized: a foreign message may
     * quote whatever was handed to the syscall, and these paths handle credentials. It travels so
     * that a stack, a debugger or a test can still reach the original.
     */
    cause?: unknown;
    /** Fields for --json beyond `message` and `code`. */
    json?: Partial<ErrorJson> | undefined;
};

/**
 * oclif takes the exit code from two places: `handle()` reads `oclif.exit`, Command.catch under
 * --json reads `exitCode` and never rethrows. Set one and the other mode exits 1.
 */
export class CliError extends Errors.CLIError {
    readonly exitCode: number;
    readonly json: ErrorJson;

    constructor(message: string, exit: number, code?: string, options: CliErrorOptions = {}) {
        super(message, { exit });
        this.exitCode = exit;
        this.code = code;
        this.json = { message, code, ...options.json };

        // Assigned only when there is one: an own `cause: undefined` would read as "none known"
        // where none was ever offered.
        if (options.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}

const cliError = (message: string, exit: number, code?: string, json?: Partial<ErrorJson>): Error => {
    return new CliError(message, exit, code, { json });
};

/**
 * An errno — ENOSPC, EACCES, EROFS — classifies a failure without repeating it. It is the part of
 * a foreign error that is safe to show: a full disk and a denied write are fixed differently, and
 * a message that only says "could not access" sends whoever reads it looking in the wrong place.
 */
export const errorCode = (error: unknown): string | undefined => {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
};

/** What a nested failure adds to an error of ours: our own text, or a stranger's errno alone. */
const describeFailure = (error: unknown): string => {
    if (error instanceof CliError || isSdkError(error)) {
        return error.message;
    }

    return errorCode(error) ?? 'unknown error';
};

export type CleanupFailure = {
    cause: unknown;
    file: string;
    reason: string;
};

/** `reason` is `any` on the settled result; naming it `unknown` is what keeps it from spreading. */
const rejectionOf = (result: PromiseSettledResult<unknown> | undefined): { reason: unknown } | undefined => {
    return result?.status === 'rejected' ? result : undefined;
};

/**
 * Which files a best-effort cleanup could not finish, and why. Files and settled results are
 * positional siblings, one per attempt: "could not remove these two" alone leaves the next person
 * guessing between a permission, a read-only mount and a directory sitting where a file belongs.
 */
export const describeCleanupFailures = (
    files: readonly string[],
    results: readonly PromiseSettledResult<unknown>[],
): CleanupFailure[] => {
    const failures: CleanupFailure[] = [];

    for (const [index, file] of files.entries()) {
        const rejection = rejectionOf(results[index]);

        if (rejection) {
            failures.push({ cause: rejection.reason, file, reason: describeFailure(rejection.reason) });
        }
    }

    return failures;
};

/** Issue.path is a camelCase sdk field; the user typed a kebab-case flag. */
const flagName = (path: string): string => `--${path.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`;

const describeIssue = (issue: Issue): string =>
    (issue.path === undefined ? issue.message : `${flagName(issue.path)}: ${issue.message}`);

/**
 * The one place where an sdk error gets a human text and an exit code. No default in the switch:
 * a new kind fails to compile until it is mapped here.
 */
export const toCliError = (error: unknown): Error => {
    if (!isSdkError(error)) {
        // Parser errors carry only oclif.exit; JSON handling reads exitCode instead.
        // Preserve the error instance and its diagnostics, including any explicit non-usage exit.
        if (error instanceof Errors.CLIError && typeof error.oclif.exit === 'number' && !('exitCode' in error)) {
            return Object.assign(error, { exitCode: error.oclif.exit });
        }

        return error instanceof Error ? error : new Error(String(error));
    }

    switch (error.kind) {
        case 'api': {
            // `http_<status>` is our own placeholder, not a code the user can look up
            const code = error.code === undefined || error.code.startsWith('http_') ? undefined : error.code;

            const jsonCode = error.code ?? `http_${error.status}`;

            const fields = typeof error.details === 'object' && error.details !== null && 'errors' in error.details
                ? error.details.errors
                : undefined;

            const diagnostics = wizardDiagnostics(error.details);
            // A permission denial is an auth failure; retain the server's explanation and diagnostics.
            const exit = error.status === 403 ? exitCode.auth : exitCode.api;

            return cliError(wizardErrorMessage(error.message, diagnostics), exit, code, {
                ...diagnostics,
                code: jsonCode,
                error_code: jsonCode,
                errors: fields,
                message: error.message,
                status: error.status,
                status_code: error.status,
            });
        }

        case 'auth_required': {
            return cliError(
                error.reason === 'missing'
                    ? 'Not authenticated. Run `adapty auth login`.'
                    : 'Token expired or invalid. Run `adapty auth login`.',
                exitCode.auth,
                undefined,
                { code: error.kind, status: error.reason === 'rejected' ? 401 : undefined },
            );
        }

        case 'cancelled': {
            return cliError('Cancelled.', exitCode.cancelled);
        }

        case 'device_flow_denied': {
            return cliError('Authorization was denied. Run `adapty auth login` to try again.', exitCode.auth);
        }

        case 'device_flow_expired': {
            return cliError('The code expired before authorization. Run `adapty auth login` to get a new one.', exitCode.auth);
        }

        case 'network': {
            return cliError(`Could not reach ${error.url}. Check the connection and try again.`, exitCode.network, undefined, {
                code: 'network_error',
                error_code: 'network_error',
                errors: { connection: [error.cause instanceof Error ? error.cause.message : error.message] },
                status: 0,
                status_code: 0,
            });
        }

        case 'storage': {
            return cliError(`${error.message}\nDelete the file and run \`adapty auth login\` again.`, exitCode.auth);
        }

        case 'validation': {
            // A header plus one indented line per issue: a rule reports them all at once
            const lines = error.issues.map(issue => describeIssue(issue));

            return cliError(['Invalid input:', ...lines].join('\n  '), exitCode.usage);
        }
    }
};
