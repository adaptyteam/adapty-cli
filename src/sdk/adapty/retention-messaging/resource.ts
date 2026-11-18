import { pageQuery } from '../pagination.js';

import { messageForm } from './form.js';

import type {
    ListRetentionMessagesParams,
    MessageWritePlan,
    PlanSwitchSuggestions,
    ProductSuggestions,
    ProductSuggestParams,
    PromoOfferSuggestions,
    RealtimeUrl,
    RetentionMessageAnswer,
    RetentionMessageList,
    RetentionMode,
    RetentionSetupStatus,
    RetentionStatusAction,
    SuggestParams,
} from './model.js';
import type { Http } from '../../core/http/index.js';

/**
 * Apple Retention Messaging of an app: the setup, the messages and the suggestions for a message.
 *
 * Only the reads are retried. A create or an update is never sent twice: it sends the message to
 * Apple review again, and a second create makes a second message. The reads of the setup status,
 * of the list and of one message are reads with an effect, as in the dashboard: the server asks Apple
 * for the review results and saves them, and can start to show an approved message.
 */
export const retentionMessaging = (http: Http) => {
    const base = (appId: string): string => `/apps/${appId}/retention-messaging`;

    const suggestQuery = (params: SuggestParams) => ({ limit: params.limit, search: params.search });

    return {
        setupStatus: (appId: string) => http.get<RetentionSetupStatus>(`${base(appId)}/setup-status`),

        realtimeUrl: (appId: string) => http.get<RealtimeUrl>(`${base(appId)}/realtime-url`),

        /** 204, no body: Apple gets the Adapty URL for the mode. */
        configureRealtimeUrl: (appId: string, mode: RetentionMode) =>
            http.post<undefined>(`${base(appId)}/realtime-url/configure`, { mode }),

        /** 204, no body. The performance test runs only in sandbox. */
        startPerformanceTest: (appId: string) =>
            http.post<undefined>(`${base(appId)}/performance-test/start`, { mode: 'sandbox' }),

        messages: {
            list: (appId: string, params: ListRetentionMessagesParams) => http.get<RetentionMessageList>(`${base(appId)}/messages`, {
                query: {
                    'filter[search]': params.search,
                    'filter[state]': params.state,
                    'filter[type]': params.type,
                    'mode': params.mode,
                    'ordering': params.ordering,
                    ...pageQuery(params),
                },
            }),

            get: (appId: string, messageId: string) => http.get<RetentionMessageAnswer>(`${base(appId)}/messages/${messageId}`),

            /** A plan from `planCreate`, sent once. */
            create: (appId: string, mode: RetentionMode, plan: MessageWritePlan) =>
                http.post<RetentionMessageAnswer>(`${base(appId)}/messages`, messageForm(plan), { query: { mode } }),

            /** A plan from `planUpdate`: the full body, sent once. */
            update: (appId: string, messageId: string, plan: MessageWritePlan) =>
                http.put<RetentionMessageAnswer>(`${base(appId)}/messages/${messageId}`, messageForm(plan)),

            setStatus: (appId: string, messageId: string, action: RetentionStatusAction) =>
                http.post<RetentionMessageAnswer>(`${base(appId)}/messages/${messageId}/status`, { action }),
        },

        suggest: {
            products: (appId: string, params: ProductSuggestParams) => http.get<ProductSuggestions>(`${base(appId)}/products/suggest`, {
                query: { ...suggestQuery(params), message_id: params.messageId, mode: params.mode, type: params.type },
            }),

            promoOffers: (appId: string, productId: string, params: SuggestParams) =>
                http.get<PromoOfferSuggestions>(`${base(appId)}/products/${productId}/promo-offers/suggest`, { query: suggestQuery(params) }),

            planSwitches: (appId: string, productId: string, params: SuggestParams) =>
                http.get<PlanSwitchSuggestions>(`${base(appId)}/products/${productId}/plan-switches/suggest`, { query: suggestQuery(params) }),
        },
    };
};

export type RetentionMessagingApi = ReturnType<typeof retentionMessaging>;
