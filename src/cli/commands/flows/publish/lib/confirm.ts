import { CliError, exitCode } from '../../../../errors.js';
import { ask } from '../../../../input/prompt.js';

/**
 * The question of the published `flows publish`, kept as it was: with --json or no terminal on stdin it
 * refuses with exit 2 and the request on stderr; at a terminal it asks `Apply? [y/N]`.
 */

export type PublishPreview = {
    /** The requests in the order they are sent: `METHOD path`. */
    requests: string[];
    summary: string;
};

const isYes = (answer: string): boolean => /^y(es)?$/i.test(answer.trim());

export const confirmPublish = async (
    preview: PublishPreview,
    options: { json: boolean; signal: AbortSignal; yes: boolean },
): Promise<void> => {
    if (options.yes) {
        return;
    }

    const text = [preview.summary, ...preview.requests].join('\n');

    if (options.json || !process.stdin.isTTY) {
        const reason = `${preview.summary} changes your account. Re-run with --yes to apply it without a prompt.`;

        process.stderr.write(`${reason}\n${text}\n`);

        throw new CliError(reason, exitCode.usage);
    }

    process.stderr.write(`${text}\n`);

    const answer = await ask({ question: 'Apply? [y/N] ', signal: options.signal }, value => value);

    if (!isYes(answer)) {
        throw new CliError('Cancelled, nothing was sent.', 1);
    }
};
