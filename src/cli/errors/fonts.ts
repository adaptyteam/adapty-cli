import { FontAnswerError } from '../../sdk/adapty/index.js';
import { CliError, toCliError } from '../errors.js';

/**
 * A font error as the CLI says it: an answer without a list the CLI acts on comes from a server without the font
 * routes, and the CLI reads nothing as empty. Every other error maps as anywhere else.
 */
export const toFontsCliError = (error: unknown): Error => {
    const mapped = toCliError(error);

    if (!(error instanceof FontAnswerError) || !(mapped instanceof CliError)) {
        return mapped;
    }

    const message = `${mapped.message} The CLI needs a server with the font routes; nothing was read as empty.`;

    return new CliError(message, mapped.exitCode, mapped.code, { cause: error, json: { ...mapped.json, message } });
};
