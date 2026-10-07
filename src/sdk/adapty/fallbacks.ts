import type { Http } from '../core/http/index.js';

/** The portal's `Platform` names a store: `Android` is Play Store, every other value App Store. */
export type FallbackPlatform = 'Android' | 'iOS';

export type FallbackInput = {
    platform: FallbackPlatform;
    /** The app's Adapty SDK version, `X.Y.Z`; the server picks the file format from it. */
    sdkVersion: string;
};

/**
 * One file per store, covering every placement of the app. It is never parsed: a large app's file is
 * hundreds of megabytes, and the SDK that bundles it wants the server's bytes as they are.
 *
 * Exactly one request, never retried: the server builds the file in memory for every request, a
 * build that ran out of memory answers 502, and a retry starts the same multi-GB build on the next
 * pod. Whoever wants another try waits for the server's Retry-After and asks again.
 */
export const fallbacks = (http: Http) => ({
    download: (appId: string, input: FallbackInput) => http.stream(`/apps/${appId}/fallbacks`, {
        query: { platform: input.platform, sdk_version: input.sdkVersion },
        retry: false,
    }),
});

export type FallbacksApi = ReturnType<typeof fallbacks>;
