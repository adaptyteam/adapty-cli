import type { Http } from '../core/http/index.js';

/** The portal's `Platform` names a store: `Android` is Play Store, every other value App Store. */
export type FallbackPlatform = 'Android' | 'iOS';

export type FallbackInput = {
    platform: FallbackPlatform;
    /** The app's Adapty SDK version, `X.Y.Z`; the server picks the file format from it. */
    sdkVersion: string;
};

/**
 * The file the SDK bundles. Only the frame is typed: the CLI passes the file through untouched, and
 * the content under `data` and `ui_builder` belongs to the SDK that reads it.
 */
export type FallbackFile = {
    data: Record<string, unknown>;
    meta: {
        developer_ids: string[];
        response_created_at: number;
        version: number;
    };
    ui_builder?: Record<string, unknown>;
};

/** One file per store, covering every placement of the app. */
export const fallbacks = (http: Http) => ({
    get: (appId: string, input: FallbackInput) => http.get<FallbackFile>(`/apps/${appId}/fallbacks`, {
        query: { platform: input.platform, sdk_version: input.sdkVersion },
    }),
});

export type FallbacksApi = ReturnType<typeof fallbacks>;
