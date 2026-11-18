/** The refund preference of a store, as the server names it. Play Store has no prorated refund. */
export const appStorePreferences = [
    'no_preference',
    'always_decline',
    'always_refund',
    'decline_first_grant_next',
    'always_prorated',
] as const;

export const playStorePreferences = ['no_preference', 'always_decline', 'always_refund', 'decline_first_grant_next'] as const;

/** The preference set on one profile; it wins over the preference of the store. */
export const customPreferences = ['grant', 'no_preference', 'decline', 'grant_prorated'] as const;

export const refundStores = ['app_store', 'play_store'] as const;

export type AppStorePreference = (typeof appStorePreferences)[number];
export type PlayStorePreference = (typeof playStorePreferences)[number];
export type CustomPreference = (typeof customPreferences)[number];
export type RefundStore = (typeof refundStores)[number];

export type RefundSaverStores = {
    app_store: { preference: AppStorePreference; refund_saver_needs_consent: boolean };
    play_store: { preference: PlayStorePreference };
};

export type RefundSaverState = {
    /** True when Refund Saver is on in either store. */
    enabled: boolean;
    stores: RefundSaverStores;
};

/** `billing_note`: the note of the server after `on`; null after `off`. */
export type RefundSaverSwitch = RefundSaverState & {
    billing_note: null | string;
};

export type RefundSaverPreferences = {
    stores: RefundSaverStores;
};

export type RefundSaverReadiness = {
    app_store: boolean;
    play_store: boolean;
};

export type RefundSaverProfileSettings = {
    consent: boolean | null;
    custom_preference: CustomPreference | null;
};

export type RefundRequest = {
    amount_usd: number;
    country_name: null | string;
    customer_user_id: null | string;
    profile_id: null | string;
    received_at: null | string;
    refund_reason: null | string;
    status: string;
    store_product_id: string;
    store_transaction_id: string;
    updated_at: string;
};

export type RefundMetrics = {
    requested_amount_usd: number;
    requested_count: number;
    saved_amount_usd: number;
    saved_count: number;
    /** A percent with one decimal, as text: `"62.5"`. */
    win_rate: string;
};
