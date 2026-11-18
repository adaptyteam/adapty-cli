import { assertValid } from '../../core/validation.js';

import { periodQuery, requestsQuery } from './period.js';
import { toProfileSettingsRequest, validateProfileSettings } from './profile.js';
import { toUpdateRequest, validateUpdateRefundSaver } from './update.js';

import type {
    RefundMetrics,
    RefundRequest,
    RefundSaverPreferences,
    RefundSaverProfileSettings,
    RefundSaverReadiness,
    RefundSaverState,
    RefundSaverSwitch,
} from './model.js';
import type { ListRefundRequestsInput, RefundPeriodInput } from './period.js';
import type { UpdateProfileSettingsInput } from './profile.js';
import type { UpdateRefundSaverInput } from './update.js';
import type { Http } from '../../core/http/index.js';
import type { Paginated } from '../pagination.js';

/** Refund Saver of one app. */
export const refundSaver = (http: Http) => {
    const base = (appId: string): string => `/apps/${appId}/refund-saver`;
    const profile = (appId: string, profileId: string): string => `${base(appId)}/profiles/${profileId}`;

    return {
        get: (appId: string) => http.get<RefundSaverState>(base(appId)),
        off: (appId: string) => http.post<RefundSaverSwitch>(`${base(appId)}/disable`),
        on: (appId: string) => http.post<RefundSaverSwitch>(`${base(appId)}/enable`),
        readiness: (appId: string) => http.get<RefundSaverReadiness>(`${base(appId)}/readiness`),

        update: async (appId: string, input: UpdateRefundSaverInput): Promise<RefundSaverPreferences> => {
            assertValid(validateUpdateRefundSaver(input));

            return http.patch<RefundSaverPreferences>(`${base(appId)}/preferences`, toUpdateRequest(input));
        },

        profile: {
            get: (appId: string, profileId: string) => http.get<RefundSaverProfileSettings>(profile(appId, profileId)),

            update: async (appId: string, profileId: string, input: UpdateProfileSettingsInput) => {
                assertValid(validateProfileSettings(input));

                const body = toProfileSettingsRequest(input);

                return http.post<RefundSaverProfileSettings>(profile(appId, profileId), body);
            },
        },

        metrics: (appId: string, input: RefundPeriodInput) =>
            http.get<RefundMetrics>(`${base(appId)}/metrics`, { query: periodQuery(input) }),
        requests: (appId: string, input: ListRefundRequestsInput) =>
            http.get<Paginated<RefundRequest>>(`${base(appId)}/transactions`, { query: requestsQuery(input) }),
    };
};

export type RefundSaverApi = ReturnType<typeof refundSaver>;
