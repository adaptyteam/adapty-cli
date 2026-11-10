/**
 * What the user does next after an API error that has its own code. The server text says what went
 * wrong; the hint says what to do about it, under that text and as `hint` in --json. A code that is
 * not here gets no hint.
 */
const HINTS: Readonly<Record<string, string>> = {
    flow_archived: 'The flow is archived. Restore it from the archive in the dashboard first.',
    flow_config_conflict: 'List the versions again and retry.',
    flow_publishing: 'Wait until the publish ends.',
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
