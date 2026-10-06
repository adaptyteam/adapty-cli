import type { Http, StreamedResponse } from '../core/http/index.js';

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
 * Without `read` the body is handed over after the headers, retried until then. With `read` the
 * whole attempt, body included, runs inside the retry policy: for a consumer that can start over,
 * such as a temp file, and never for one that cannot, such as stdout.
 */
export const fallbacks = (http: Http) => {
    const path = (appId: string) => `/apps/${appId}/fallbacks`;
    const query = (input: FallbackInput) => ({ platform: input.platform, sdk_version: input.sdkVersion });

    type Read<T> = (response: StreamedResponse) => Promise<T>;

    function download(appId: string, input: FallbackInput): Promise<StreamedResponse>;

    function download<T>(appId: string, input: FallbackInput, read: Read<T>): Promise<T>;

    function download<T>(
        appId: string,
        input: FallbackInput,
        read?: Read<T>,
    ): Promise<StreamedResponse | T> {
        return read === undefined
            ? http.stream(path(appId), { query: query(input) })
            : http.stream(path(appId), { query: query(input), read });
    }

    return { download };
};

export type FallbacksApi = ReturnType<typeof fallbacks>;
