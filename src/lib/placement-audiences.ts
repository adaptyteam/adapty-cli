// Runtime guard for --audiences entries parsed from user/agent-supplied JSON.
// The DTO union in api-schemas.ts requires content_type, but a JSON.parse gives
// back `unknown`, so the type alone cannot enforce it — this does, the same way
// for humans and agents (no prompting).

/**
 * Returns a human-readable problem string when `entry` is not a valid placement
 * audience entry, or `null` when it is well-formed. Every entry must carry an
 * explicit `content_type` ('paywall' | 'flow'); there is no implicit paywall.
 */
export function audienceEntryProblem(entry: unknown): null | string {
  if (typeof entry !== 'object' || entry === null) {
    return 'each entry must be a JSON object'
  }

  const {content_type: contentType, flow_id: flowId, paywall_id: paywallId} = entry as Record<string, unknown>

  if (contentType !== 'flow' && contentType !== 'paywall') {
    return 'content_type is required and must be "paywall" or "flow"'
  }

  if (contentType === 'paywall' && typeof paywallId !== 'string') {
    return 'a paywall entry requires paywall_id'
  }

  if (contentType === 'flow' && typeof flowId !== 'string') {
    return 'a flow entry requires flow_id'
  }

  return null
}
