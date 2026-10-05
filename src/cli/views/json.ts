/**
 * A value as plain JSON, compact and on one line: for a command whose stdout *is* a file, so a
 * redirect gives the same parseable content in human mode as under --json. `log` adds the newline.
 */
export const renderJson = (value: unknown): string => JSON.stringify(value);
