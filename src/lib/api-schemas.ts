// Hand-picked DTOs from the Adapty Developer API OpenAPI schema. Kept in
// lockstep with the server-side `portal.developer_api_context.domains.data_transfer_objects.resource_data.*` types.
//
// To refresh after a backend change, fetch the spec with:
//   curl -H 'Referer: /api/v1/developer/' http://localhost:8000/api/v1/swagger/schema/
// and update the affected definitions here.

export type ProductPeriod =
  | 'annual'
  | 'consumable'
  | 'lifetime'
  | 'monthly'
  | 'nonsubscriptions'
  | 'semiannual'
  | 'trimonthly'
  | 'two_months'
  | 'uncategorised'
  | 'weekly'

export interface VendorProductDTO {
  base_plan_id: null | string
  id: null | string
  product_id: null | string
}

export interface AppSummaryDTO {
  id: string
  sdk_key: null | string
  title: string
}

export interface AppDetailDTO {
  apple_bundle_id: null | string
  google_bundle_id: null | string
  id: string
  platforms: string[]
  sdk_key: null | string
  secret_key: null | string
  title: string
}

export interface AppCreateRequestDTO {
  apple_bundle_id?: null | string
  google_bundle_id?: null | string
  title: string
}

export interface AppUpdateRequestDTO {
  apple_bundle_id?: null | string
  google_bundle_id?: null | string
  title?: null | string
}

export interface AccessLevelDTO {
  id: string
  sdk_id: string
  title: null | string
}

export interface AccessLevelCreateRequestDTO {
  sdk_id: string
  title?: null | string
}

export interface AccessLevelUpdateRequestDTO {
  title?: null | string
}

export interface ProductDTO {
  access_level_id: string
  id: string
  period: ProductPeriod
  title: string
  vendor_products: Record<string, VendorProductDTO>
}

export interface ProductCreateRequestDTO {
  access_level_id: string
  android_base_plan_id?: null | string
  android_product_id?: null | string
  ios_product_id?: null | string
  period: ProductPeriod
  price_usd?: null | number
  title: string
}

export interface ProductUpdateRequestDTO {
  access_level_id: string
  title: string
}

export interface PaywallDTO {
  id: string
  product_ids: string[]
  title: string
}

export interface PaywallWriteRequestDTO {
  product_ids?: string[]
  title: string
}

export interface SegmentDTO {
  description: null | string
  id: string
  title: string
}

export interface PlacementAudienceEntryDTO {
  paywall_id: string
  priority: number
  segment_ids?: string[]
}

export interface PlacementSummaryDTO {
  developer_id: string
  id: string
  title: string
}

export interface PlacementDetailDTO {
  audiences?: PlacementAudienceEntryDTO[]
  developer_id: string
  id: string
  title: string
}

export interface PlacementWriteRequestDTO {
  audiences: null | PlacementAudienceEntryDTO[]
  developer_id: string
  /** @deprecated use `audiences` */
  paywall_id: null | string
  title: string
}
