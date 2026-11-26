/**
 * Where a flow is fixed: the two "• …" lines of the Builder UI of the flow and the flows agent skill. One text for
 * every message that sends the user there: a refused `flows publish` and the draft-flow refusal of a placement.
 */
export const flowFixLinks = (flowId: string): string =>
    `  • Builder UI: https://app.adapty.io/flows/${flowId}/builder\n  • Adapty flows agent skill: https://adapty.io/docs/flow-generator-skill`;
