import {isValidUuid} from './flags.js'

export const ADD_AS_KEYWORD_ACTION = 'add-as-keyword-to'

export const CPT_BID_TYPES = ['ad_group_default_bid', 'keyword_current_bid', 'search_term_current_cpt', 'set_to']
export const KEYWORD_MATCH_TYPES = ['BROAD', 'EXACT']
export const NEGATE_TYPES = ['ad-group', 'campaign']

const SEARCH_TERM = 'search-term'
const TARGETING_KEYWORD = 'targeting-keyword'

const BID_TYPE_IGNORING_VALUE = 'ad_group_default_bid'
const BID_TYPES_READING_MARKUP = new Set(['keyword_current_bid', 'search_term_current_cpt'])

// KeywordMatchType also carries AUTO. --match-type never offers it — an automation creates a
// keyword, and AUTO is not something a keyword can be — but a rule that already stores AUTO keeps
// it rather than being pushed onto another match type by an edit that never mentioned match types.
const STORED_MATCH_TYPES = new Set(['AUTO', ...KEYWORD_MATCH_TYPES])

const SHARED_FLAGS = ['target-ad-group', 'match-type', 'cpt-bid-type', 'cpt-bid'] as const
const SEARCH_TERM_FLAGS = ['negate', 'no-negate', 'skip-enable-duplicates'] as const
const TARGETING_KEYWORD_FLAGS = ['pause-original'] as const

export interface AddKeywordActionFlags {
  'cpt-bid'?: string
  'cpt-bid-type'?: string
  'match-type'?: string
  negate?: string
  'no-negate'?: boolean
  'pause-original'?: boolean
  'skip-enable-duplicates'?: boolean
  'target-ad-group'?: string[]
}

type ActionFlagName = keyof AddKeywordActionFlags

const ALL_FLAGS: ActionFlagName[] = [...SHARED_FLAGS, ...SEARCH_TERM_FLAGS, ...TARGETING_KEYWORD_FLAGS]

const MISSING_REASONS: Record<string, string> = {
  'cpt-bid': 'the bid to set, required by --cpt-bid-type set_to',
  'cpt-bid-type': 'where the bid of the new keyword comes from; the API has no default',
  'match-type': 'BROAD or EXACT; the API has no default',
  'target-ad-group': 'the ad groups the keyword is added to; a rule with none does nothing',
}

function dashed(name: string): string {
  return `--${name}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function isFlagSet(flags: AddKeywordActionFlags, name: ActionFlagName): boolean {
  const value = flags[name]
  if (value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  // --no-negate has no negated form of its own, so only a true means it was passed.
  return name === 'no-negate' ? value === true : true
}

export function hasAddKeywordActionFlags(flags: AddKeywordActionFlags): boolean {
  return ALL_FLAGS.some((name) => isFlagSet(flags, name))
}

// Params are rebuilt, not patched: a rule may store the add-as-negative-keyword shape
// ({target_type, ids}) under an add-as-keyword-to action, and the API picks the params variant by
// shape without a discriminator — so every stray key silently changes which action gets run.
// Only what fits the expected shape is carried over; the rest has to come from the flags.
function storedInternalIds(params: Record<string, unknown>): string[] {
  const ids = asRecord(params.targets).internal_ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && isValidUuid(id)) : []
}

function storedMatchType(params: Record<string, unknown>): string | undefined {
  const matchType = params.match_type
  return typeof matchType === 'string' && STORED_MATCH_TYPES.has(matchType) ? matchType : undefined
}

function storedCptBidType(params: Record<string, unknown>): string | undefined {
  const {type} = asRecord(params.cpt_bid)
  return typeof type === 'string' && CPT_BID_TYPES.includes(type) ? type : undefined
}

function storedCptBidValue(params: Record<string, unknown>): number | undefined {
  const {value} = asRecord(params.cpt_bid)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function storedBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function storedNegate(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const {enabled, type} = asRecord(params.negate)
  if (typeof enabled !== 'boolean') return undefined
  if (type === null || type === undefined) return {enabled, type: null}
  return typeof type === 'string' && NEGATE_TYPES.includes(type) ? {enabled, type} : undefined
}

function resolveNegate(flags: AddKeywordActionFlags, params: Record<string, unknown>): Record<string, unknown> {
  if (flags.negate !== undefined) return {enabled: true, type: flags.negate}
  if (flags['no-negate'] === true) return {enabled: false, type: null}
  return storedNegate(params) ?? {enabled: false, type: null}
}

function resolveCptBidValue(
  cptBidType: string | undefined,
  bid: string | undefined,
  params: Record<string, unknown>,
): null | number | undefined {
  if (cptBidType === 'set_to') return bid === undefined ? storedCptBidValue(params) : Number(bid)
  if (cptBidType !== undefined && BID_TYPES_READING_MARKUP.has(cptBidType)) {
    return bid === undefined ? (storedCptBidValue(params) ?? null) : Number(bid)
  }

  return null
}

function isSearchTermRule(operateWith: unknown): boolean {
  if (operateWith === SEARCH_TERM) return true
  if (operateWith === TARGETING_KEYWORD) return false
  const shown = typeof operateWith === 'string' && operateWith.length > 0 ? `"${operateWith}"` : 'missing'
  throw new Error(
    `${ADD_AS_KEYWORD_ACTION} runs on a "${SEARCH_TERM}" or "${TARGETING_KEYWORD}" rule only; this rule's operate_with is ${shown}.`,
  )
}

function rejectForeignFlags(searchTerm: boolean, flags: AddKeywordActionFlags): void {
  const foreign = (searchTerm ? TARGETING_KEYWORD_FLAGS : SEARCH_TERM_FLAGS).filter((name) => isFlagSet(flags, name))
  if (foreign.length === 0) return

  const applicable = [...SHARED_FLAGS, ...(searchTerm ? SEARCH_TERM_FLAGS : TARGETING_KEYWORD_FLAGS)]
  throw new Error(
    `${foreign.map((name) => dashed(name)).join(', ')} ${foreign.length === 1 ? 'has' : 'have'} no place in the params of an ` +
      `operate_with "${searchTerm ? SEARCH_TERM : TARGETING_KEYWORD}" rule, and the API drops params it cannot ` +
      `place. Applicable action flags: ${applicable.map((name) => dashed(name)).join(', ')}.`,
  )
}

function missingFlagsError(missing: ActionFlagName[]): Error {
  const lines = missing.map((name) => `  ${dashed(name)} — ${MISSING_REASONS[name]}`)
  return new Error(`The ${ADD_AS_KEYWORD_ACTION} params are incomplete. Pass:\n${lines.join('\n')}`)
}

export function buildAddKeywordParams(
  operateWith: unknown,
  stored: unknown,
  flags: AddKeywordActionFlags,
): Record<string, unknown> {
  const searchTerm = isSearchTermRule(operateWith)
  rejectForeignFlags(searchTerm, flags)

  const params = asRecord(stored)
  const missing: ActionFlagName[] = []

  const internalIds = flags['target-ad-group'] ?? storedInternalIds(params)
  if (internalIds.length === 0) missing.push('target-ad-group')

  const matchType = flags['match-type'] ?? storedMatchType(params)
  if (matchType === undefined) missing.push('match-type')

  const cptBidType = flags['cpt-bid-type'] ?? storedCptBidType(params)
  if (cptBidType === undefined) missing.push('cpt-bid-type')

  const bid = flags['cpt-bid']
  if (bid !== undefined && cptBidType === BID_TYPE_IGNORING_VALUE) {
    throw new Error(
      `--cpt-bid has no meaning with --cpt-bid-type ${BID_TYPE_IGNORING_VALUE}; that type copies the target ad group's default bid.`,
    )
  }

  const cptBidValue = resolveCptBidValue(cptBidType, bid, params)
  if (cptBidValue === undefined) missing.push('cpt-bid')

  if (missing.length > 0) throw missingFlagsError(missing)

  const built: Record<string, unknown> = {
    cpt_bid: {type: cptBidType, value: cptBidValue ?? null},
    match_type: matchType,
    targets: {internal_ids: internalIds, type: 'ad-group'},
  }

  if (searchTerm) {
    built.negate = resolveNegate(flags, params)
    built.skip_enable_duplicate_keywords =
      flags['skip-enable-duplicates'] ?? storedBoolean(params.skip_enable_duplicate_keywords) ?? false
  } else {
    built.pause_in_original_ad_group =
      flags['pause-original'] ?? storedBoolean(params.pause_in_original_ad_group) ?? false
  }

  return built
}

export function requireSingleAction(actions: unknown): Record<string, unknown> {
  if (!Array.isArray(actions) || actions.length !== 1) {
    throw new Error('A rule needs exactly one action: the API stores one action and one condition per rule.')
  }

  return asRecord(actions[0])
}

export function rebuildAddKeywordAction(
  actions: unknown,
  operateWith: unknown,
  flags: AddKeywordActionFlags,
): Record<string, unknown>[] {
  const action = requireSingleAction(actions)
  if (action.type !== ADD_AS_KEYWORD_ACTION) {
    throw new Error(
      `The action flags only apply to an ${ADD_AS_KEYWORD_ACTION} action; this rule's action is "${String(action.type)}".`,
    )
  }

  return [{...action, params: buildAddKeywordParams(operateWith, action.params, flags)}]
}
