import { Errors } from '@oclif/core';

import { isSdkError } from '../sdk/core/errors.js';

import type { Issue } from '../sdk/core/errors.js';

/**
 * Exit codes are the adapter's business: sdk errors carry none.
 *   2  usage     — the input is wrong (oclif's own parse errors exit 2 as well)
 *   3  auth      — no token, an expired one, or a refused authorization
 *   4  api       — the server rejected a well-formed request
 *   5  network   — the server was never reached
 * 130  cancelled — Ctrl+C, by the shell convention 128 + SIGINT
 */
export const exitCode = {
    api: 4,
    auth: 3,
    cancelled: 130,
    network: 5,
    usage: 2,
} as const;

/** HTTP status is separate from the process exit code. Snake_case fields preserve the old JSON contract. */
export type ErrorJson = {
    code?: string | undefined;
    error_code?: string | undefined;
    errors?: unknown;
    message: string;
    status?: number | undefined;
    status_code?: number | undefined;
};

/**
 * oclif takes the exit code from two places: `handle()` reads `oclif.exit`, Command.catch under
 * --json reads `exitCode` and never rethrows. Set one and the other mode exits 1.
 */
export class CliError extends Errors.CLIError {
    readonly exitCode: number;
    readonly json: ErrorJson;

    constructor(message: string, exit: number, code?: string, data: Partial<ErrorJson> = {}) {
        super(message, { exit });
        this.exitCode = exit;
        this.code = code;
        this.json = { message, code, ...data };
    }
}

const cliError = (message: string, exit: number, code?: string, data?: Partial<ErrorJson>): Error =>
    new CliError(message, exit, code, data);

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

            return cliError(error.message, exitCode.api, code, {
                code: jsonCode,
                error_code: jsonCode,
                errors: fields,
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
