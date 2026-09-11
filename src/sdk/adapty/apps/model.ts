/**
 * What every operation of the resource shares: the entity as the server sends it, and the
 * platform vocabulary. Answers pass through exactly as they arrive, in snake_case — that is what
 * --json has printed since the first release.
 *
 * An input shape is not shared and does not belong here: it is camelCase, it is our API rather
 * than the server's, and it lives in the file of the operation that takes it.
 */

/** In the order the published help lists them, so `--platform` keeps reading `(ios|android)`. */
export const platforms = ['ios', 'android'] as const;
export type Platform = (typeof platforms)[number];

export type AppSummary = {
    id: string;
    sdk_key: null | string;
    title: string;
};

/** What get and update answer with: the summary plus the fields only the detail view carries. */
export type AppDetail = AppSummary & {
    apple_bundle_id: null | string;
    google_bundle_id: null | string;
    /** Not the Platform union: the server owns this list and may grow it without asking us. */
    platforms: string[];
    secret_key: null | string;
};
