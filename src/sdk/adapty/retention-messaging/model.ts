/**
 * What every operation of Retention Messaging shares: the vocabulary and the answers as the server sends
 * them. Answers pass through exactly as they arrive, in snake_case, which is what --json prints.
 */

import type { Paginated } from '../pagination.js';

/** The Apple environment of a message or a setup step, not a mode of the CLI. */
export const retentionModes = ['sandbox', 'production'] as const;
export type RetentionMode = (typeof retentionModes)[number];

export const retentionMessageTypes = ['default', 'promo'] as const;
export const retentionMessageStates = ['in_review', 'live', 'rejected', 'inactive'] as const;
export const retentionStatusActions = ['activate', 'deactivate'] as const;
export type RetentionStatusAction = (typeof retentionStatusActions)[number];

export const retentionOrderings = [
    'name', '-name', 'type', '-type', 'state', '-state', 'products_count', '-products_count', 'started_at', '-started_at',
] as const;

export type RealtimeUrlStatus = 'configured_to_adapty' | 'configured_to_other_url' | 'not_configured';

export type RetentionSetupStatus = {
    credentials: string;
    production: { realtime_url_status: RealtimeUrlStatus };
    registration_status: string;
    sandbox: { performance_test_status: string; realtime_url_status: RealtimeUrlStatus };
};

export type RealtimeUrl = { url: string };

export type RetentionAssociation = { id: string; store_id: string; title: string; type: string };

export type RetentionMessageProduct = {
    association: null | RetentionAssociation;
    id: string;
    period: string;
    store_id: string;
    title: string;
};

export type RetentionBulletPoint = {
    alt_text: null | string;
    bullet_id: string;
    image: { file_name: null | string; image_id: string; url: string };
    text: string;
};

export type RetentionLocalization = {
    body: string;
    bullet_points: { text: string }[];
    locale: string;
    status: string;
    title: string;
};

/** One message as the detail, create, update and status answers carry it under `data`. */
export type RetentionMessage = {
    body: string;
    bullet_points: RetentionBulletPoint[];
    header_position: string;
    image: null | { alt_text: null | string; file_name: null | string; url: string };
    localizations: RetentionLocalization[];
    message_id: string;
    name: string;
    products: RetentionMessageProduct[];
    state: string;
    title: string;
    type: string;
};

export type RetentionMessageAnswer = { data: RetentionMessage };

export type RetentionMessageRow = {
    message_id: string;
    name: string;
    products_count: number;
    retained: number;
    retention_rate: number;
    save_rate: number;
    saved_revenue: number;
    saved_users: number;
    shown: number;
    started_at: null | string;
    state: string;
    type: string;
};

/** `exists` says whether the mode has any message at all, with no filter applied. */
export type RetentionMessageList = Paginated<RetentionMessageRow> & {
    meta: { exists: boolean };
};

export type ListRetentionMessagesParams = {
    mode: RetentionMode;
    ordering?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    state?: string | undefined;
    type?: string | undefined;
};

export type SuggestParams = {
    limit?: number | undefined;
    search?: string | undefined;
};

export type ProductSuggestParams = SuggestParams & {
    messageId?: string | undefined;
    mode: RetentionMode;
    type: string;
};

export type ProductSuggestions = {
    data: { disabled_reason: null | string; id: string; period: string; store_id: string; title: string }[];
};

export type PromoOfferSuggestions = { data: { offer_id: string; offer_title: string; store_id: string }[] };

export type PlanSwitchSuggestions = {
    data: { period: string; plan_id: string; plan_title: string; store_id: string }[];
};

/** A file as the CLI read it: its name for the messages, its bytes for the checks and the upload. */
export type ImageFile = {
    bytes: Uint8Array;
    name: string;
};

/**
 * What a create or an update sends: the JSON body without `image_index`, the header image, and the
 * icons, each bound to the bullet point it belongs to by the position of that bullet in `data`.
 */
export type MessageWritePlan = {
    data: Record<string, unknown> & { bullet_points: Record<string, unknown>[] };
    icons: { bullet: number; file: ImageFile }[];
    image?: ImageFile | undefined;
};
