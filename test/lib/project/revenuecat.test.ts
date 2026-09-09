import {expect} from 'chai'
import {createServer, type Server} from 'node:http'

import {fetchRcCatalog, renderRcCatalog} from '../../../src/lib/project/revenuecat.js'

/** One uniform reply shape for every route - status, headers, and body in one place. */
interface Reply {
  body?: unknown
  headers?: Record<string, string>
  status?: number
}

type Routes = Record<string, ((url: URL) => Reply) | Reply>

const ok = (body: unknown): Reply => ({body})

/** Replies 429 on the first hit, then delegates - for retry tests. */
function throttleOnce(then: Reply): (url: URL) => Reply {
  let throttled = false
  return () => {
    if (throttled) return then
    throttled = true
    return {headers: {'retry-after': '0'}, status: 429}
  }
}

/** Mock RC v2 API: routes by pathname; 401 on any key except sk_test. */
function startRcServer(routes: Routes): Promise<{close: () => void; url: string}> {
  const server: Server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.authorization !== 'Bearer sk_test') {
      res.statusCode = 401
      return res.end('{}')
    }

    const url = new URL(req.url!, 'http://localhost')
    const route = routes[url.pathname]
    const reply: Reply = typeof route === 'function' ? route(url) : (route ?? ok({items: []}))
    res.statusCode = reply.status ?? 200
    for (const [name, value] of Object.entries(reply.headers ?? {})) res.setHeader(name, value)
    res.end(JSON.stringify(reply.body ?? {}))
  })
  return new Promise((resolve) => {
    server.listen(0, () => {
      const {port} = server.address() as {port: number}
      resolve({close: () => server.close(), url: `http://localhost:${port}/v2`})
    })
  })
}

const BASE_ROUTES: Routes = {
  '/v2/projects': ok({items: [{id: 'p1', name: 'Magic Weather'}]}),
  '/v2/projects/p1/apps': ok({items: [{id: 'a1', name: 'iOS', type: 'app_store'}]}),
  '/v2/projects/p1/entitlements': ok({items: [{display_name: 'Premium', id: 'e1', lookup_key: 'premium'}]}),
  '/v2/projects/p1/entitlements/e1/products': ok({items: [{id: 'pr1', store_identifier: 'rc_399_1m'}]}),
  '/v2/projects/p1/offerings': ok({
    items: [
      {id: 'o1', is_current: true, lookup_key: 'default', paywall_id: null},
      {id: 'o2', is_current: false, lookup_key: 'sale', paywall_id: 'pw1'},
    ],
  }),
  '/v2/projects/p1/offerings/o1/packages': ok({
    items: [{id: 'k1', lookup_key: '$rc_monthly', products: {items: [{product: {store_identifier: 'rc_399_1m'}}]}}],
  }),
  '/v2/projects/p1/offerings/o2/packages': ok({items: []}),
  '/v2/projects/p1/paywalls/pw1': ok({id: 'pw1', published_at: '2026-01-01T00:00:00Z'}),
  '/v2/projects/p1/products': ok({
    items: [{app: {type: 'app_store'}, display_name: 'Monthly', id: 'pr1', store_identifier: 'rc_399_1m'}],
  }),
}

describe('revenuecat catalog', () => {
  let close: () => void

  afterEach(() => {
    close?.()
    delete process.env.ADAPTY_RC_API_URL
  })

  async function serve(routes: Routes): Promise<void> {
    const server = await startRcServer(routes)
    close = server.close
    process.env.ADAPTY_RC_API_URL = server.url
  }

  it('maps entitlements, products, and offerings with builder-paywall classification', async () => {
    await serve(BASE_ROUTES)
    const catalog = await fetchRcCatalog('sk_test')
    expect(catalog?.projectName).to.equal('Magic Weather')
    expect(catalog?.complete).to.equal(true)
    expect(catalog?.entitlements[0]).to.deep.include({lookupKey: 'premium', productStoreIds: ['rc_399_1m']})
    expect(catalog?.products[0]).to.deep.include({entitlementLookupKeys: ['premium'], storeIdentifier: 'rc_399_1m'})
    const [current, sale] = catalog!.offerings
    expect(current).to.deep.include({hasPublishedBuilderPaywall: false, isCurrent: true, lookupKey: 'default'})
    expect(sale.hasPublishedBuilderPaywall).to.equal(true)
  })

  it('returns null for a rejected key', async () => {
    await serve(BASE_ROUTES)
    expect(await fetchRcCatalog('sk_wrong')).to.equal(null)
  })

  it('never carries the API key into the catalog it hands to the prompt', async () => {
    await serve(BASE_ROUTES)
    const catalog = await fetchRcCatalog('sk_test')
    // The whole object graph - anything here can end up in the agent prompt.
    expect(JSON.stringify(catalog)).to.not.include('sk_test')
    expect(renderRcCatalog(catalog!)).to.not.include('sk_test')
  })

  it('follows pagination cursors across pages', async () => {
    await serve({
      ...BASE_ROUTES,
      '/v2/projects/p1/products': (url: URL) =>
        url.searchParams.get('starting_after') === 'pr1'
          ? ok({items: [{id: 'pr2', store_identifier: 'rc_3999_1y'}]})
          : ok({
              items: [{id: 'pr1', store_identifier: 'rc_399_1m'}],
              next_page: '/v2/projects/p1/products?limit=100&starting_after=pr1',
            }),
    })
    const catalog = await fetchRcCatalog('sk_test')
    expect(catalog?.products.map((p) => p.storeIdentifier)).to.deep.equal(['rc_399_1m', 'rc_3999_1y'])
    expect(catalog?.complete).to.equal(true)
  })

  it('retries a 429 instead of degrading to an empty list', async () => {
    await serve({
      ...BASE_ROUTES,
      '/v2/projects/p1/offerings/o1/packages': throttleOnce(
        ok({items: [{id: 'k1', lookup_key: '$rc_monthly', products: {items: [{product: {store_identifier: 'rc_399_1m'}}]}}]}),
      ),
    })
    const catalog = await fetchRcCatalog('sk_test')
    expect(catalog?.offerings[0].packages).to.have.length(1)
    expect(catalog?.complete).to.equal(true)
  })

  it('marks a failed builder-paywall check as unknown and the catalog as incomplete', async () => {
    await serve({...BASE_ROUTES, '/v2/projects/p1/paywalls/pw1': {status: 500}})
    const catalog = await fetchRcCatalog('sk_test')
    expect(catalog?.offerings[1].hasPublishedBuilderPaywall).to.equal('unknown')
    expect(catalog?.complete).to.equal(false)
  })

  it('renderRcCatalog tells the agent to create nothing for published and unknown builder paywalls', async () => {
    await serve({...BASE_ROUTES, '/v2/projects/p1/paywalls/pw1': {status: 500}})
    const rendered = renderRcCatalog((await fetchRcCatalog('sk_test'))!)
    expect(rendered).to.include('status UNKNOWN')
    expect(rendered).to.include('create NOTHING for this offering now')
    expect(rendered).to.include('WARNING: some RevenueCat requests failed')
  })
})
