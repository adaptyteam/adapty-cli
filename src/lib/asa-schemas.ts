
export type AsaAccessSource = 'allowlist' | 'legacy' | 'none' | 'payg'

export type AsaAppleCredentialsStatus = 'active' | 'expired' | 'invalid' | 'unset'

export type AsaKeywordMatchType = 'BROAD' | 'EXACT'

export type AsaKeywordStatus = 'ACTIVE' | 'PAUSED'

export type AsaStatus = 'ENABLED' | 'PAUSED'

export type AsaNegativeKeywordScope = 'AD_GROUP' | 'ALL_CAMPAIGN_AD_GROUPS' | 'CAMPAIGN'

export interface AsaMoney {
  amount: string
  currency: string
}

export interface AsaMetricsDTO {
  avg_cpm: string
  avg_cpt: string
  impressions: number
  ipm: string
  local_spend: string
  tap_install_cpi: string
  tap_install_rate: string
  tap_installs: number
  tap_new_downloads: number
  tap_redownloads: number
  taps: number
  total_avg_cpi: string
  total_install_rate: string
  total_installs: number
  total_new_downloads: number
  total_redownloads: number
  ttr: string
  view_installs: number
  view_new_downloads: number
  view_redownloads: number
}

export interface AsaMeDTO {
  access_source: AsaAccessSource
  apple_credentials_status: AsaAppleCredentialsStatus
  company_id: string
}

export interface AsaAppleOAuthDTO {
  auth_url: string
}

export interface AsaAppDTO {
  adam_id: number
  bundle_id: null | string
  campaign_group_ids: string[]
  country_or_region_codes: string[]
  developer_name: null | string
  internal_id: string
  last_synced_at: string
  name: string
}

export interface AsaLocInvoiceDetails {
  billing_contact_email: null | string
  buyer_email: null | string
  buyer_name: null | string
  client_name: null | string
  order_number: null | string
}

export interface AsaCampaignGroupDTO {
  currency: string
  internal_id: string
  last_synced_at: string
  org_id: number
  org_name: string
  parent_org_id: number
  payment_model: null | string
  time_zone: string
}

export interface AsaCampaignDTO {
  ad_channel_type: string
  adam_id: number
  app_id: string
  bidding_strategy: null | string
  billing_event: string
  budget_amount: AsaMoney | null
  campaign_group_id: string
  campaign_id: number
  countries_or_regions: string[]
  daily_budget_amount: AsaMoney | null
  end_time: null | string
  internal_id: string
  loc_invoice_details: AsaLocInvoiceDetails | null
  name: string
  org_id: number
  payment_model: null | string
  serving_state_reasons: null | string[]
  serving_status: null | string
  start_time: null | string
  status: AsaStatus
  supply_sources: string[]
  target_cpa: AsaMoney | null
}

export interface AsaAdGroupDTO {
  ad_group_id: number
  app_id: string
  automated_keywords_opt_in: boolean | null
  automated_keywords_required: boolean | null
  bidding_strategy: null | string
  campaign_group_id: string
  campaign_id: string
  cpa_goal: AsaMoney | null
  default_bid_amount: AsaMoney
  end_time: null | string
  internal_id: string
  name: string
  payment_model: null | string
  pricing_model: null | string
  serving_state_reasons: null | string[]
  serving_status: null | string
  start_time: null | string
  status: AsaStatus | null
  target_cpa: AsaMoney | null
}

export interface AsaKeywordDTO {
  ad_group_id: string
  app_id: string
  bid_amount: AsaMoney
  campaign_group_id: string
  campaign_id: string
  creation_time: null | string
  internal_id: string
  keyword_id: number
  match_type: AsaKeywordMatchType
  status: AsaKeywordStatus | null
  text: string
}

export interface AsaSearchTermDTO {
  ad_group_id: string
  app_id: string
  campaign_group_id: string
  campaign_id: string
  country_or_region: string
  keyword_id: null | string
  match_type: AsaKeywordMatchType | null
  metrics: AsaMetricsDTO
  rank: null | number
  search_popularity: null | number
  source: null | string
  text: null | string
}

export interface AsaNegativeKeywordDTO {
  ad_group_id: null | string
  ad_group_name: null | string
  campaign_id: string
  campaign_name: null | string
  internal_id: string
  last_synced_at: string
  match_type: AsaKeywordMatchType
  status: AsaKeywordStatus
  text: string
}

export interface AsaCreativeDTO {
  adam_id: number
  app_id: string
  campaign_group_id: string
  creative_id: number
  internal_id: string
  name: string
  org_id: number
  product_page_id: null | string
  state: string
  state_reasons: string[]
  type: string
}

export interface AsaProductPageDTO {
  adam_id: number
  app_id: string
  deep_link: null | string
  external_id: number
  internal_id: string
  language_codes: string[]
  languages: string[]
  last_synced_at: string
  name: string
  state: string
}

export interface AsaAdDTO {
  ad_group_id: string
  ad_group_name: null | string
  ad_id: number
  app_id: null | string
  campaign_group_id: string
  campaign_id: string
  creation_time: null | string
  creative_id: null | string
  creative_type: string
  internal_id: string
  last_synced_at: string
  name: string
  product_page_id: null | string
  product_page_name: null | string
  serving_state_reasons: string[]
  serving_status: string
  status: AsaStatus
}

export interface AsaAutomationDTO {
  actions: unknown[]
  apply_to: unknown[]
  conditions: unknown[]
  created_at: string
  date_last_run: null | string
  date_next_run: null | string
  id: string
  name: string
  operate_with: string
  rba_type: string
  run_frequency: Record<string, unknown>
  status: number
  updated_at: string
}

export interface AsaAutomationRunDTO {
  [key: string]: unknown
  id?: string
}

export interface AsaAutomationRunEnqueuedDTO {
  automation_id: string
  dry_run: boolean
  run_id: null | string
}

export interface AsaProductPageSyncDTO {
  accepted_at: string
  message: string
  org_targets: number
  replayed: boolean
  state: string
  sync_id: string
}

export interface AsaCompetitorTopAppDTO {
  adamId: number
  avgSov: string
  countries: string[]
  iconUrl: null | string
  name: null | string
  termsCount: number
}

export interface AsaCompetitorContestedTermDTO {
  competitorCount: number
  maxSov: string
  term: string
}

export interface AsaCompetitorsSummaryTotalDTO {
  competitorsCount: number
  countriesAsaCount: number
  countriesWithAsaTerms: number
  mostContestedTerms: AsaCompetitorContestedTermDTO[]
  topAppsByPerformance: AsaCompetitorTopAppDTO[]
  totalUniqueTerms: number
}

export interface AsaCompetitorAppTermsDTO {
  adamId: number
  countries: Record<string, {sov: string; term: string}[]>
  iconUrl: null | string
  name: null | string
}

export interface AsaCompetitorsSummaryDTO {
  byApps: AsaCompetitorAppTermsDTO[]
  total: AsaCompetitorsSummaryTotalDTO
}

export interface AsaMutationError {
  apple_error_code?: null | string
  apple_error_message?: null | string
  entity_type?: string
  input_ref?: null | number
  operation?: string
  retryable?: boolean
  validation_error_code?: string
  validation_error_message?: string
}

export interface AsaCampaignMutationDTO {
  campaign: AsaCampaignMutationEntity | null
  errors: AsaMutationError[]
}

export interface AsaCampaignMutationEntity {
  campaign_group_id: string
  campaign_id: number
  internal_id: string
  loc_invoice_details: AsaLocInvoiceDetails | null
  name: string
  payment_model: null | string
  serving_state_reasons: null | string[]
  serving_status: null | string
  status: AsaStatus
}

export interface AsaAdGroupMutationDTO {
  ad_group: null | Record<string, unknown>
  errors: AsaMutationError[]
}

export interface AsaAdMutationDTO {
  ad: AsaAdDTO | null
  errors: AsaMutationError[]
}

export interface AsaKeywordMutationDTO {
  errors: AsaMutationError[]
  is_validation_failure: boolean
  keywords: Record<string, unknown>[]
}

export interface AsaNegativeKeywordMutationDTO {
  errors: AsaMutationError[]
  is_validation_failure: boolean
  negative_keywords: Record<string, unknown>[]
}

export interface AsaAutomationMutationDTO {
  automation: AsaAutomationDTO | null
}

export type AsaBulkOperationStatus = 'failed' | 'partial' | 'pending' | 'running' | 'success'

export interface AsaBulkOperationAcceptedDTO {
  operation_id: string
}

export interface AsaBulkOperationCountsDTO {
  applied: number
  failed: number
  pending: number
  total: number
}

export interface AsaBulkOperationObjectDTO {
  apple_error_code: null | string
  apple_error_message: null | string
  entity_kind: string
  external_id: null | number
  item_ref: string
  status: string
  step_type: string
}

export interface AsaBulkOperationStateDTO {
  counts: AsaBulkOperationCountsDTO
  created_at: string
  finished_at: null | string
  objects: AsaBulkOperationObjectDTO[]
  operation_id: string
  pipelines: Record<string, unknown>[]
  started_at: null | string
  status: AsaBulkOperationStatus
}

export interface AsaBulkOperationListItemDTO {
  app_id: string
  created_at: string
  error: null | string
  finished_at: null | string
  operation_id: string
  started_at: null | string
  status: AsaBulkOperationStatus
}

export interface AsaBulkOperationListDTO {
  items: AsaBulkOperationListItemDTO[]
  limit: number
  offset: number
  total: number
}

export interface AsaTemplateIssueDTO {
  column: null | string
  message: string
  row: null | number
  sheet: null | string
}

export interface AsaBulkConvertResultDTO {
  errors: AsaTemplateIssueDTO[]
  request: null | Record<string, unknown>
  warnings: AsaTemplateIssueDTO[]
}
