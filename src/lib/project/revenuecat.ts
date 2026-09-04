/**
 * Read-only RevenueCat v2 API client for `adapty migrate --rc-key`.
 * One RC v2 secret key = one RC project (the wizard model from the dashboard
 * import design). Everything is fetched once, up front; the agent receives a
 * rendered snapshot and never sees the key itself.
 *
 * Every sub-fetch is best-effort, but failure is DISTINGUISHED from empty:
 * a throttled or failed fetch must never masquerade as "this offering has no
 * packages" or "no builder paywall" - the downstream mapping rules treat
 * those states very differently (a misread builder paywall permanently burns
 * a placement ID).
 */

const rcApiBase = () => process.env.ADAPTY_RC_API_URL ?? 'https://api.revenuecat.com/v2'

/** Max simultaneous RC requests - large accounts must not trip rate limiting. */
const RC_CONCURRENCY = 5
/** Pagination safety valve: 20 pages x 100 items per list. */
const MAX_PAGES = 20

export interface RcEntitlement {
  displayName: string
  lookupKey: string
  /** Store identifiers of the products attached to this entitlement. */
  productStoreIds: string[]
}

export interface RcProduct {
  displayName: string
  entitlementLookupKeys: string[]
  storeIdentifier: string
  storeType: string
}

export interface RcOffering {
  displayName: string
  /** true = published RC Paywall Builder paywall; 'unknown' = the API didn't say OR the check failed. */
  hasPublishedBuilderPaywall: 'unknown' | boolean
  isCurrent: boolean
  lookupKey: string
  metadata: null | Record<string, unknown>
  /** "package lookup_key -> store identifiers" in position order; null = the fetch FAILED (not "no packages"). */
  packages: Array<{lookupKey: string; productStoreIds: string[]}> | null
}

export interface RcCatalog {
  apps: Array<{name: string; type: string}>
  /** false when any list was truncated or a sub-fetch failed - the catalog may be incomplete. */
  complete: boolean
  entitlements: RcEntitlement[]
  offerings: RcOffering[]
  products: RcProduct[]
  projectName: string
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Run fn over items with bounded concurrency, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({length: items.length})
  let next = 0
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function rcGet<T>(key: string, path: string): Promise<null | T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${rcApiBase()}${path}`, {
        headers: {accept: 'application/json', authorization: `Bearer ${key}`},
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 429) {
        const retryAfter = Number.parseFloat(res.headers.get('retry-after') ?? '1')
        await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 10_000))
        continue
      }

      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  return null
}

// RC response shapes shift and are only partially documented; access is defensive throughout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

interface RcPage {
  items?: Raw[]
  next_page?: null | string
}

/** Fetch every page of a list endpoint. null = the FIRST page failed; `complete` = no truncation/failure. */
async function rcGetAll(key: string, path: string): Promise<null | {complete: boolean; items: Raw[]}> {
  const items: Raw[] = []
  let next: null | string = `${path}${path.includes('?') ? '&' : '?'}limit=100`
  for (let page = 0; page < MAX_PAGES && next; page++) {
    const data: null | RcPage = await rcGet<RcPage>(key, next)
    if (!data) return page === 0 ? null : {complete: false, items}
    items.push(...(data.items ?? []))
    // next_page comes back as an absolute API path including the /v2 prefix our base already has.
    next = data.next_page ? data.next_page.replace(/^\/v2/, '') : null
  }

  return {complete: !next, items}
}

export async function fetchRcCatalog(key: string): Promise<null | RcCatalog> {
  const projects = await rcGet<RcPage>(key, '/projects?limit=100')
  const project = projects?.items?.[0]
  if (!project) return null
  const pid = String(project.id)

  const [apps, entitlementsRaw, productsRaw, offeringsRaw] = await Promise.all([
    rcGetAll(key, `/projects/${pid}/apps`),
    rcGetAll(key, `/projects/${pid}/entitlements`),
    rcGetAll(key, `/projects/${pid}/products`),
    rcGetAll(key, `/projects/${pid}/offerings`),
  ])
  let complete = [apps, entitlementsRaw, productsRaw, offeringsRaw].every((r) => r !== null && r.complete)

  // product <-> entitlement association is only exposed from the entitlement side.
  const entitlementProducts = new Map<string, Raw[]>()
  await mapLimit(entitlementsRaw?.items ?? [], RC_CONCURRENCY, async (ent) => {
    const products = await rcGetAll(key, `/projects/${pid}/entitlements/${ent.id}/products`)
    if (!products?.complete) complete = false
    entitlementProducts.set(String(ent.id), products?.items ?? [])
  })

  const entitlements: RcEntitlement[] = (entitlementsRaw?.items ?? []).map((ent) => ({
    displayName: String(ent.display_name ?? ent.lookup_key ?? ent.id),
    lookupKey: String(ent.lookup_key ?? ent.id),
    productStoreIds: (entitlementProducts.get(String(ent.id)) ?? []).map((p) => String(p.store_identifier ?? p.id)),
  }))

  const products: RcProduct[] = (productsRaw?.items ?? []).map((product) => {
    const storeId = String(product.store_identifier ?? product.id)
    return {
      displayName: String(product.display_name ?? storeId),
      entitlementLookupKeys: entitlements.filter((e) => e.productStoreIds.includes(storeId)).map((e) => e.lookupKey),
      storeIdentifier: storeId,
      storeType: String(product.app?.type ?? product.store ?? product.type ?? ''),
    }
  })

  const offerings: RcOffering[] = await mapLimit(offeringsRaw?.items ?? [], RC_CONCURRENCY, async (off) => {
    const packages = await rcGetAll(key, `/projects/${pid}/offerings/${off.id}/packages?expand=items.product`)
    if (!packages?.complete) complete = false

    // Published builder paywall = non-null paywall id whose paywall has published_at.
    // A FAILED check stays 'unknown' - downstream must not create anything for it.
    let hasPublishedBuilderPaywall: 'unknown' | boolean = 'unknown'
    if ('paywall_id' in off || 'paywall' in off) {
      const paywallId = off.paywall_id ?? off.paywall?.id
      if (paywallId) {
        const paywall = await rcGet<Raw>(key, `/projects/${pid}/paywalls/${paywallId}`)
        hasPublishedBuilderPaywall = paywall ? Boolean(paywall.published_at) : 'unknown'
        if (!paywall) complete = false
      } else {
        hasPublishedBuilderPaywall = false
      }
    }

    return {
      displayName: String(off.display_name ?? off.lookup_key ?? off.id),
      hasPublishedBuilderPaywall,
      isCurrent: Boolean(off.is_current),
      lookupKey: String(off.lookup_key ?? off.id),
      metadata: off.metadata && typeof off.metadata === 'object' ? (off.metadata as Record<string, unknown>) : null,
      packages: packages
        ? packages.items.map((pkg) => ({
            lookupKey: String(pkg.lookup_key ?? pkg.id),
            productStoreIds: ((pkg.products?.items ?? pkg.products ?? []) as Raw[]).map((p) =>
              String(p.product?.store_identifier ?? p.store_identifier ?? p.id),
            ),
          }))
        : null,
    }
  })

  return {
    apps: (apps?.items ?? []).map((a) => ({name: String(a.name ?? a.id), type: String(a.type ?? '')})),
    complete,
    entitlements,
    offerings,
    products,
    projectName: String(project.name ?? pid),
  }
}

/** Compact markdown snapshot for the agent prompt. */
export function renderRcCatalog(catalog: RcCatalog): string {
  const lines: string[] = [
    `RevenueCat project: ${catalog.projectName}`,
    `Stores: ${catalog.apps.map((a) => `${a.name} (${a.type})`).join(', ') || '(none listed)'}`,
    ...(catalog.complete
      ? []
      : [
          '',
          'WARNING: some RevenueCat requests failed or were truncated - this catalog may be INCOMPLETE. Add to ADAPTY_SETUP.md that the user must compare it against the RC dashboard before trusting it.',
        ]),
    '',
    'Entitlements (one Adapty access level each; access level ID = lookup_key):',
    ...(catalog.entitlements.length > 0
      ? catalog.entitlements.map(
          (e) => `- ${e.lookupKey} ("${e.displayName}") - products: ${e.productStoreIds.join(', ') || '(none)'}`,
        )
      : ['- (none - use the default "premium" access level and note that in ADAPTY_SETUP.md)']),
    '',
    'Products (use these EXACT store identifiers):',
    ...catalog.products.map(
      (p) =>
        `- ${p.storeIdentifier}${p.storeType ? ` [${p.storeType}]` : ''} ("${p.displayName}") - entitlements: ${p.entitlementLookupKeys.join(', ') || '(none - flag the access-level choice)'}`,
    ),
    '',
    'Offerings (placement ID = lookup_key):',
    ...catalog.offerings.map((o) => {
      const packages =
        o.packages === null
          ? 'FETCH FAILED - do not guess; list this offering in ADAPTY_SETUP.md for manual verification'
          : o.packages.map((pkg) => `${pkg.lookupKey}: ${pkg.productStoreIds.join('+')}`).join('; ') || '(none)'
      const builder =
        o.hasPublishedBuilderPaywall === true
          ? 'PUBLISHED BUILDER PAYWALL - create NOTHING for this offering, reserve the placement ID for a flow (see rules)'
          : o.hasPublishedBuilderPaywall === 'unknown'
            ? 'builder paywall status UNKNOWN (API did not confirm; RC v1 paywalls are also invisible to it) - create NOTHING for this offering now; add to ADAPTY_SETUP.md: check in the RC dashboard whether it has a builder paywall, then either create the placement + paywall or rebuild it as a flow'
            : 'no builder paywall - create placement + paywall'
      return (
        `- ${o.lookupKey} ("${o.displayName}")${o.isCurrent ? ' [CURRENT]' : ''} - packages: ${packages} - ${builder}` +
        (o.metadata ? `\n  metadata (-> paywall remote config): ${JSON.stringify(o.metadata)}` : '')
      )
    }),
  ]
  return lines.join('\n')
}
