import { Command } from '@oclif/core';

import { CliError, toCliError } from '../errors.js';

import type { ErrorJson } from '../errors.js';

/**
 * What every command gets and nothing more: the output channel, cancellation, the single place
 * where sdk errors become CLI errors. Product SDKs and sessions belong to their adapters.
 *
 * Whatever lives here is paid for by 75 commands, so what stays out matters as much: flags stay
 * composable objects, views stay plain functions, and one command's needs stay in that command.
 */
export abstract class BaseCommand extends Command {
    /** --json is a property of the CLI, not a per-command opt-in; `auth login` opts back out. */
    static override enableJsonFlag = true;

    readonly #abort = new AbortController();

    // A field, not an inline closure: removeListener needs this very reference, or listeners pile
    // up whenever several commands run in one process — which tests do.
    readonly #onSigint = (): void => {
        this.#abort.abort();
    };

    protected get signal(): AbortSignal {
        return this.#abort.signal;
    }

    protected override async catch(error: Error): Promise<unknown> {
        return super.catch(toCliError(error));
    }

    protected override toErrorJson(error: unknown): { error: ErrorJson } {
        if (error instanceof CliError) {
            return { error: error.json };
        }

        // Error.message is non-enumerable; serializing the Error itself drops the explanation.
        // Only expose public fields, not oclif's parser context or a command's internal state.
        const cause = error instanceof Error ? error : new Error(String(error));

        return {
            error: {
                code: 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined,
                message: cause.message,
            },
        };
    }

    protected override async finally(error: Error | undefined): Promise<unknown> {
        process.removeListener('SIGINT', this.#onSigint);

        return super.finally(error);
    }

    protected override async init(): Promise<void> {
        await super.init();
        // Abort instead of exit: the command unwinds, the sdk raises CancelledError and
        // cli/errors.ts turns it into exit 130 — exiting from the handler is how the published
        // `auth login` ends a cancelled login with exit 0. `once` leaves a second Ctrl+C to the
        // runtime, so an unresponsive command can still be killed the usual way.
        process.once('SIGINT', this.#onSigint);
    }

    /**
     * run() returns the data and render() prints it, so run()'s return type *is* the --json
     * contract, checked by the compiler: change a response shape in the sdk and the command stops
     * compiling instead of quietly changing what users parse.
     *
     * The guard is not what keeps --json clean — oclif's `log` is already silent then. It keeps the
     * view from being built at all, so a human view may cost whatever it needs.
     */
    protected render<T>(value: T, view: (value: T) => string): void {
        if (!this.jsonEnabled()) {
            this.log(view(value));
        }
    }
}
