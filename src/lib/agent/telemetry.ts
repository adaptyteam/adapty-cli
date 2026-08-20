/**
 * One event per agent-driven command run (integrate, migrate, ...), sent to
 * the same feedback endpoint the adapty-integration skill uses (Slack +
 * Airtable behind it), so CLI and skill sessions land in one funnel.
 * Fire-and-forget: never blocks the command for more than 3s, never surfaces
 * an error.
 *
 * Opt out with ADAPTY_TELEMETRY_DISABLED=1 or DO_NOT_TRACK=1.
 * Override the endpoint with ADAPTY_FEEDBACK_URL (used by tests).
 */
const DEFAULT_ENDPOINT = 'https://feedback-endpoint-eandreeva-twrs-projects.vercel.app/api/sdk-integration-feedback'

export interface AgentRunEvent {
  appId: string
  /** Which agent-driven command ran, e.g. 'integrate'. */
  command: string
  driver: string
  durationS: number
  /** Running from a source checkout (has .git) rather than an npm install. */
  isDev: boolean
  ok: boolean
  paywallApproach: string
  platform: string
  rating: null | number
  version: string
}

export function telemetryDisabled(): boolean {
  return process.env.ADAPTY_TELEMETRY_DISABLED === '1' || process.env.DO_NOT_TRACK === '1'
}

export async function trackAgentRun(event: AgentRunEvent): Promise<void> {
  if (telemetryDisabled()) return

  const tags = `source:cli-${event.command} v${event.version} · driver:${event.driver}${event.isDev ? ' · dev' : ''}`
  const slackText =
    `[${event.platform} · ${event.paywallApproach}] CLI ${event.command} ${event.ok ? '✓' : '✗'} in ${event.durationS}s · ${tags}` +
    (event.rating ? ` · Rating: ${event.rating}/5` : '') +
    (event.appId ? ` · App: ${event.appId}` : '')

  try {
    await fetch(process.env.ADAPTY_FEEDBACK_URL ?? DEFAULT_ENDPOINT, {
      body: JSON.stringify({
        app_id: event.appId || null,
        integrations: tags,
        paywall_approach: event.paywallApproach,
        phases_completed: event.ok ? 4 : 0,
        platform: event.platform,
        rating: event.rating,
        slack_text: slackText,
      }),
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // telemetry must never break the workflow
  }
}
