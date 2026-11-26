import { CliError, exitCode } from '../../../../errors.js';
import { confirmAction } from '../../../../input/confirm.js';

/**
 * The question of the published `flows publish`, kept as it was, on the shared confirmation: with --json or no
 * terminal on stdin it refuses with exit 2 and the request on stderr; a terminal on stdin is asked `Apply? [y/N]`,
 * whatever stdout is.
 */

export type PublishPreview = {
    /** The requests in the order they are sent: `METHOD path`. */
    requests: string[];
    summary: string;
};

export const confirmPublish = async (
    preview: PublishPreview,
    options: { json: boolean; signal: AbortSignal; yes: boolean },
): Promise<void> => {
    const effect = [preview.summary, ...preview.requests].join('\n');

    await confirmAction({
        effect,
        // The published rule: only --json stops the question; a terminal on stdin can answer
        interactive: !options.json,
        refuse: (output) => {
            const reason = `${preview.summary} changes your account. Re-run with --yes to apply it without a prompt.`;

            output.write(`${reason}\n${effect}\n`);

            return new CliError(reason, exitCode.usage);
        },
        signal: options.signal,
        yes: options.yes,
    });
};
