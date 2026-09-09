// Hand-picked DTOs from the Adapty Developer API OpenAPI schema. Kept in
// lockstep with the server-side `portal.developer_api_context.domains.data_transfer_objects.resource_data.*` types.
//
// To refresh after a backend change, fetch the spec with:
//   curl -H 'Referer: /api/v1/developer/' http://localhost:8000/api/v1/swagger/schema/
// and update the affected definitions here.

export type ProductPeriod
    = | 'annual'
        | 'consumable'
        | 'lifetime'
        | 'monthly'
        | 'nonsubscriptions'
        | 'semiannual'
        | 'trimonthly'
        | 'two_months'
        | 'uncategorised'
        | 'weekly';

export type VendorProductDTO = {
    base_plan_id: null | string;
    id: null | string;
    product_id: null | string;
};

export type AppSummaryDTO = {
    id: string;
    sdk_key: null | string;
    title: string;
};

export type AppDetailDTO = {
    apple_bundle_id: null | string;
    google_bundle_id: null | string;
    id: string;
    platforms: string[];
    sdk_key: null | string;
    secret_key: null | string;
    title: string;
};

export type AppCreateRequestDTO = {
    apple_bundle_id?: null | string;
    google_bundle_id?: null | string;
    title: string;
};

export type AppUpdateRequestDTO = {
    apple_bundle_id?: null | string;
    google_bundle_id?: null | string;
    title?: null | string;
};

export type AccessLevelDTO = {
    id: string;
    sdk_id: string;
    title: null | string;
};

export type AccessLevelCreateRequestDTO = {
    sdk_id: string;
    title?: null | string;
};

export type AccessLevelUpdateRequestDTO = {
    title?: null | string;
};

export type ProductDTO = {
    access_level_id: string;
    id: string;
    period: ProductPeriod;
    title: string;
    vendor_products: Record<string, VendorProductDTO>;
};

export type ProductCreateRequestDTO = {
    access_level_id: string;
    android_base_plan_id?: null | string;
    android_product_id?: null | string;
    ios_product_id?: null | string;
    paddle_price_id?: null | string;
    paddle_product_id?: null | string;
    period: ProductPeriod;
    price_usd?: null | number;
    stripe_price_id?: null | string;
    stripe_product_id?: null | string;
    title: string;
};

export type ProductUpdateRequestDTO = {
    access_level_id: string;
    title: string;
};

export type PaywallDTO = {
    id: string;
    product_ids: string[];
    title: string;
};

export type PaywallWriteRequestDTO = {
    product_ids?: string[];
    title: string;
};

/** Flow lifecycle status. Values come from the server-side `FlowStatus` enum (e.g. draft, dirty, published). */
export type FlowStatus = string;

export type FlowDTO = {
    id: string;
    name: string;
    status: FlowStatus;
    updated_at: string;
};

export type FlowRemoteConfigDTO = {
    data: string;
    locale: string;
};

export type FlowConfigDTO = {
    config: Record<string, unknown>;
    /** Human message for a failed publication (raw passthrough from the flow version). */
    publication_error?: null | string;

    /** Publication lifecycle of the flow version: transforming|transformed|uploading|uploaded|published|failed. */
    publication_status?: string;
    remote_configs: FlowRemoteConfigDTO[];
    status: FlowStatus;

    /** Raw transform failure: a JSON issues payload or a summary string. Parse with `parseFlowPublicationError`. */
    transform_error?: null | string;
    // eslint-disable-next-line @stylistic/max-len -- FIXME if you see this
    /** Millisecond timestamp of the last content change; the value `expected_updated_at` is compared against on write. */
    updated_at: number;
};

export type FlowWriteRequestDTO = {
    name: string;
};

export type FlowConfigWriteRequestDTO = {
    config: Record<string, unknown>;
    /** Optimistic lock: the `updated_at` from a prior config read. Omit for last-write-wins. */
    expected_updated_at?: null | number;
    remote_configs?: FlowRemoteConfigDTO[];
};

export type FlowConfigValidateRequestDTO = {
    config: Record<string, unknown>;
};

export type FlowConfigIssueDTO = {
    /** Machine code, relayed from the transformer; absent until it reports path-level diagnostics. */
    code?: null | string;
    message: string;
    /** Location of the issue; absent until the transformer reports path-level diagnostics. */
    path?: null | string;
    severity: string;
};

export type FlowConfigValidationDTO = {
    issues: FlowConfigIssueDTO[];
    valid: boolean;
};

export type MediaDTO = {
    id: number;
    name: string;
    /** Base64-encoded preview thumbnail; absent when no preview was generated. */
    preview_base64?: null | string;
    /** CDN URL to reference from a flow config. */
    url: string;
};

export type SegmentDTO = {
    description: null | string;
    id: string;
    title: string;
};

export type PlacementPaywallAudienceEntryDTO = {
    content_type: 'paywall';
    paywall_id: string;
    priority: number;
    segment_ids?: string[];
};

export type PlacementFlowAudienceEntryDTO = {
    content_type: 'flow';
    /** The flow must be `published` (not draft) — the backend returns 400 otherwise. */
    flow_id: string;
    priority: number;
    segment_ids?: string[];
};

export type PlacementAudienceEntryDTO = PlacementFlowAudienceEntryDTO | PlacementPaywallAudienceEntryDTO;

export type PlacementSummaryDTO = {
    developer_id: string;
    id: string;
    /** Placement activation state: true = Live, false = Inactive. */
    is_active: boolean;
    title: string;
};

export type PlacementDetailDTO = {
    audiences?: PlacementAudienceEntryDTO[];
    developer_id: string;
    id: string;
    /** Placement activation state: true = Live, false = Inactive. */
    is_active: boolean;
    title: string;
};

export type PlacementWriteRequestDTO = {
    audiences: null | PlacementAudienceEntryDTO[];
    developer_id: string;
    /** @deprecated use `audiences` */
    paywall_id: null | string;
    title: string;
};
