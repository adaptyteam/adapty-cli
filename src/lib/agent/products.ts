import {type ProductPeriod, VALID_PERIODS} from '../api-schemas.js'
import {type Platform} from '../project/scan.js'
import {confirm, isInteractive, notice, select, text} from '../ui/ask.js'

/**
 * Interactive collection of real store product IDs. Store IDs are immutable
 * in Adapty, so user-provided IDs are the difference between the agent
 * creating the full dashboard setup (products + paywall + placement) and
 * deferring all of it to ADAPTY_SETUP.md.
 *
 * Contracts:
 * - Skippable at every step: the store question has an explicit skip option,
 *   and an empty answer to the first ID prompt of a product abandons
 *   collection ("I'll do it later" is always one Enter away).
 * - Cancel (Esc/Ctrl-C) anywhere returns null - the caller aborts the whole
 *   command, same as cancelling any other wizard question.
 * - "-" for a store ID means "this product is not in that store".
 */

export interface StoreProduct {
  appStoreId?: string
  /** Only for Google Play subscriptions (never set when period is 'lifetime'). */
  googleBasePlanId?: string
  googlePlayId?: string
  period: ProductPeriod
}

type StorePick = 'app_store' | 'both' | 'google_play' | 'skip'

/** Exhaustive by construction: adding a Platform member forces a decision here. */
const PLATFORM_STORES: Record<Platform, {appStore: boolean; googlePlay: boolean}> = {
  android: {appStore: false, googlePlay: true},
  capacitor: {appStore: true, googlePlay: true},
  flutter: {appStore: true, googlePlay: true},
  ios: {appStore: true, googlePlay: false},
  kmp: {appStore: true, googlePlay: true},
  'react-native': {appStore: true, googlePlay: true},
  unity: {appStore: true, googlePlay: true},
}

/**
 * The store question is a single select of mutually exclusive combinations -
 * never a multi-select competing with a "No" option. Irrelevant stores are
 * not shown at all. null = cancelled.
 */
async function askWhichStores(platform: Platform): Promise<null | StorePick> {
  const {appStore, googlePlay} = PLATFORM_STORES[platform]
  const options = [
    ...(appStore && googlePlay ? [{label: 'Yes, in both stores', value: 'both'}] : []),
    ...(appStore
      ? [{label: googlePlay ? 'Yes, in the App Store only' : 'Yes, in the App Store', value: 'app_store'}]
      : []),
    ...(googlePlay
      ? [{label: appStore ? 'Yes, in Google Play only' : 'Yes, in Google Play', value: 'google_play'}]
      : []),
    {hint: 'the agent will leave ready-to-run commands in ADAPTY_SETUP.md', label: 'Not yet - skip', value: 'skip'},
  ]
  const answer = await select('Do your products already exist in the stores?', options, 'skip')
  return answer as null | StorePick
}

/**
 * One store-ID answer: null = cancelled, '' = skip/finish, '-' = not in this
 * store. Rejects IDs with whitespace (immutable once created - a typo is
 * unfixable) and warns about uppercase in Google Play IDs.
 */
async function askProductId(
  message: string,
  defaultValue: string | undefined,
  googlePlay: boolean,
): Promise<null | string> {
  for (;;) {
    const raw = await text(message, defaultValue)
    if (raw === null) return null
    const id = raw.trim()
    if (!id || id === '-') return id
    if (/\s/.test(id)) {
      notice('Store product IDs cannot contain spaces - store IDs are immutable in Adapty, so typos are unfixable.')
      continue
    }

    if (googlePlay && /[A-Z]/.test(id)) {
      notice('Google Play product IDs are lowercase by convention - double-check this one before continuing.')
    }

    return id
  }
}

/**
 * Returns the collected products, [] when skipped, or null when the user
 * cancelled (the caller should abort the command). Headless runs always
 * return [] without prompting.
 */
export async function collectStoreProducts(platform: Platform): Promise<null | StoreProduct[]> {
  if (!isInteractive()) return []

  const pick = await askWhichStores(platform)
  if (pick === null) return null
  if (pick === 'skip') return []

  const askAppStore = pick === 'app_store' || pick === 'both'
  const askGooglePlay = pick === 'google_play' || pick === 'both'
  const products: StoreProduct[] = []

  for (;;) {
    const n = products.length + 1
    const exitHint = n === 1 ? 'Enter to skip products for now' : 'Enter to finish'

    let appStoreId: string | undefined
    if (askAppStore) {
      const notInStore = askGooglePlay ? ', "-" if not on the App Store' : ''
      const id = await askProductId(`Product ${n} - App Store product ID (${exitHint}${notInStore})`, undefined, false)
      if (id === null) return null
      if (!id) break
      if (id !== '-') appStoreId = id
    }

    let googlePlayId: string | undefined
    if (askGooglePlay) {
      // Cross-store products usually share the identifier - Enter reuses it.
      const message = appStoreId
        ? `Product ${n} - Google Play product ID (Enter to reuse the App Store ID, "-" if not on Google Play)`
        : `Product ${n} - Google Play product ID (${exitHint})`
      const id = await askProductId(message, appStoreId, true)
      if (id === null) return null
      if (!id && !appStoreId) break
      if (id && id !== '-') googlePlayId = id
    }

    // Both stores answered "-": nothing to create for this entry.
    if (!appStoreId && !googlePlayId) break

    const period = await select(
      `Product ${n} - subscription period`,
      VALID_PERIODS.map((value) => ({
        hint: value === 'lifetime' ? 'one-time purchase, not a subscription' : undefined,
        label: value,
        value,
      })),
      'monthly',
    )
    if (period === null) return null

    // Google Play subscriptions carry a base plan; lifetime products never do.
    let googleBasePlanId: string | undefined
    if (googlePlayId && period !== 'lifetime') {
      const basePlan = await text(`Product ${n} - Google Play base plan ID (e.g. "monthly-base")`)
      if (basePlan === null) return null
      if (basePlan.trim()) googleBasePlanId = basePlan.trim()
    }

    products.push({appStoreId, googleBasePlanId, googlePlayId, period: period as ProductPeriod})

    const more = await confirm(`Product ${n} saved. Add another?`, false)
    if (more === null) return null
    if (!more) break
  }

  return products
}

/** Prompt block: user-provided ground truth, same contract as the RC catalog. */
export function renderStoreProducts(products: StoreProduct[]): string {
  const lines = products.map((p) => {
    const parts = [
      `period: ${p.period}`,
      ...(p.appStoreId ? [`App Store: ${p.appStoreId}`] : []),
      ...(p.googlePlayId
        ? [`Google Play: ${p.googlePlayId}${p.googleBasePlanId ? ` (base plan: ${p.googleBasePlanId})` : ''}`]
        : []),
    ]
    return `- ${parts.join(' | ')}`
  })
  return `The user provided their EXACT store product IDs and periods - use them verbatim (store IDs are immutable, never "normalize" them; pass the period to \`products create --period\`). One line = one Adapty product; a line with both stores = ONE product carrying both store IDs.
${lines.join('\n')}`
}
