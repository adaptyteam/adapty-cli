export const APP_URL_ENV_VAR = 'ADAPTY_APP_URL'
export const DEFAULT_APP_URL = 'https://app.adapty.io'

/** Dashboard origin: ADAPTY_APP_URL when set, production otherwise. Only its origin is used. */
function appBaseUrl(): URL {
  const base = process.env[APP_URL_ENV_VAR] ?? DEFAULT_APP_URL
  try {
    return new URL(base)
  } catch {
    throw new Error(`Invalid ${APP_URL_ENV_VAR}: ${base}`)
  }
}

/** Builds a dashboard URL for a fixed route, e.g. the flow preview page. */
export function appUrl(path: string): URL {
  return new URL(path, appBaseUrl())
}

/**
 * Moves a link the API issued (the device-flow verification URI) onto the configured dashboard
 * host, so pointing the CLI at a local or staging dashboard keeps the browser there too. Without
 * ADAPTY_APP_URL the link is left exactly as issued — the API is free to serve it from any host.
 */
export function onAppHost(issuedUrl: string): string {
  if (!process.env[APP_URL_ENV_VAR]) return issuedUrl

  let issued: URL
  try {
    issued = new URL(issuedUrl)
  } catch {
    return issuedUrl
  }

  return appUrl(`${issued.pathname}${issued.search}${issued.hash}`).toString()
}
