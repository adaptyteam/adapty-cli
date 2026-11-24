import { isSdkError } from '../../sdk/core/errors.js';
import { CliError, toCliError } from '../errors.js';

/**
 * What the user does next after an API error that has its own code. The server text says what went
 * wrong; the hint says what to do about it, under that text and as `hint` in --json. A code that is
 * not here gets no hint.
 */
const HINTS: Readonly<Record<string, string>> = {
    flow_archived: 'The flow is archived. Restore it from the archive in the dashboard first.',
    flow_config_conflict: 'List the versions again and retry.',
    flow_publishing: 'Wait until the publish ends.',
    hypothesis_duplicate: 'Run `adapty hypotheses get --app <app> <id>` to see the open one, or pass --force to create another.',
    hypothesis_link_failed: 'Run `adapty hypotheses by-ab-test --app <app> <ab_test_id>` to see what the test already judges, '
        + 'or pick a test on the placement of the hypothesis with `adapty ab-tests list --app <app>`.',
    hypothesis_variant_mismatch: 'Check the arms with `adapty ab-tests get --app <app> <ab_test_id>`: they must be the flow of the '
        + 'hypothesis and its variant. To change the variant, unaccept and accept again with --variant-flow.',
    hypothesis_payload_conflict: 'Leave hypothesis_id out to create a new hypothesis, or resend the payload stored under it.',
};

const hintFor = (code: string | undefined): string | undefined => (code === undefined ? undefined : HINTS[code]);

/** The message with the hint of its code on the next line. */
export const withHint = (message: string, code: string | undefined): string => {
    const hint = hintFor(code);

    return hint === undefined ? message : `${message}\n${hint}`;
};

/** `{ hint }` for the --json error, or nothing. */
export const hintJson = (code: string | undefined): { hint?: string } => {
    const hint = hintFor(code);

    return hint === undefined ? {} : { hint };
};

/**
 * A create or an update whose answer never came: the server was not reached in time or answered
 * 5xx, so nobody knows whether the write went through. The CLI never sends it again; it keeps the
 * exit code of the failure (5 or 4) and says what to do instead, also as `hint` in --json. `fields` go
 * into --json beside it, as they are: a value that is not safe in a command line is given there.
 */
export const withUnknownResult = (error: unknown, next: string, fields: Record<string, string> = {}): unknown => {
    if (!isSdkError(error)) {
        return error;
    }

    const lost = error.kind === 'network' || (error.kind === 'api' && error.status >= 500);
    const mapped = lost ? toCliError(error) : undefined;

    if (!(mapped instanceof CliError)) {
        return error;
    }

    const hint = `The result is unknown: the answer to the write was lost. ${next}`;
    const message = `${mapped.message}\n${hint}`;

    const json = { ...mapped.json, hint, message };

    const refused = new CliError(message, mapped.exitCode, mapped.code, { cause: error, json });

    Object.assign(refused.json, fields);

    return refused;
};
