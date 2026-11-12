import { dashboardOnlyActions } from '../../sdk/adapty/index.js';

import { renderFooter } from './list.js';
import { table } from './table.js';

import type {
    CreatedHypotheses,
    Hypothesis,
    HypothesisSummary,
    Paginated,
} from '../../sdk/adapty/index.js';

const NONE = '—';

const named = (id: string, title: null | string | undefined, isRemoved = false): string => {
    const text = title === null || title === undefined || title === '' ? id : `${title} (${id})`;

    return isRemoved ? `${text}, removed` : text;
};

/** The actions a command of this topic can take now; `none` too, so an agent never guesses. */
export const allowedActionsText = (hypothesis: Hypothesis): string => {
    const actions = hypothesis.allowed_actions.filter(action => !dashboardOnlyActions.includes(action));

    return actions.length === 0 ? 'none' : actions.join(', ');
};

const stateText = (hypothesis: Hypothesis): string =>
    (hypothesis.phase === hypothesis.state ? hypothesis.state : `${hypothesis.state} (phase ${hypothesis.phase})`);

/** The title and `is_removed` belong to the entity the subject type names; the other ids print bare. */
const subjectText = ({ subject }: Hypothesis): string => {
    const owner = subject.type === 'flow_screen' ? 'flow' : subject.type;

    const ref = (ownedBy: string, label: string, id: string): string =>
        (ownedBy === owner ? `${label} ${named(id, subject.title, subject.is_removed)}` : `${label} ${id}`);

    const parts = [subject.type];

    if (subject.flow_id !== null) {
        parts.push(ref('flow', 'flow', subject.flow_id));
    }

    if (subject.flow_screen_id !== null) {
        parts.push(`screen ${subject.flow_screen_id}`);
    }

    if (subject.segment_id !== null) {
        parts.push(ref('audience', 'segment', subject.segment_id));
    }

    if (subject.paywall_id !== null) {
        parts.push(ref('paywall', 'paywall', subject.paywall_id));
    }

    if (subject.country_code !== null) {
        parts.push(`country ${subject.country_code}`);
    }

    return parts.join(', ');
};

const abTestText = ({ ab_test: test, ab_test_id: id }: Hypothesis): string => {
    if (test === null) {
        return id ?? NONE;
    }

    const winner = test.winner_flow_id === null ? '' : `, winner flow ${test.winner_flow_id}`;

    return `${test.id} (${test.state}${winner}${test.is_removed ? ', removed' : ''})`;
};

const outcomeText = ({ outcome }: Hypothesis): string =>
    (outcome === null ? NONE : `${outcome.kind.replaceAll('_', ' ')} ${named(outcome.id, outcome.title, outcome.is_removed)}`);

const expectedText = ({ expected }: Hypothesis): string | undefined => {
    if (expected === null) {
        return undefined;
    }

    const range = expected.low_pct === null || expected.high_pct === null
        ? ''
        : `${String(expected.low_pct)}% to ${String(expected.high_pct)}%`;

    const impact = [expected.metric ?? '', range].filter(part => part !== '').join(' ');

    return [impact, expected.evidence_text ?? ''].filter(part => part !== '').join(': ');
};

const productLine = (product: Hypothesis['products'][number]): string => {
    const parts = [product.duration_type];

    if (product.trial_duration !== null) {
        parts.push(`trial ${String(product.trial_duration)} days`);
    }

    if (product.country !== null) {
        parts.push(`country ${product.country}`);
    }

    if (product.store_product_id !== null) {
        parts.push(`store id ${product.store_product_id}`);
    }

    if (product.price !== null) {
        parts.push(`price ${String(product.price)}${product.currency === null ? '' : ` ${product.currency}`}`);
    }

    if (product.current_local_price !== null) {
        parts.push(`current local price ${String(product.current_local_price)}`);
    }

    const filled = product.product_id === null
        ? 'not filled'
        : `product ${named(product.product_id, product.product?.title, product.product?.is_removed)}`;

    return `  - ${product.hypothesis_product_id}: ${parts.join(', ')}; ${filled}`;
};

const head = (hypothesis: Hypothesis): string[] => [
    `ID: ${hypothesis.hypothesis_id}`,
    `Title: ${hypothesis.title}`,
    `Allowed Actions: ${allowedActionsText(hypothesis)}`,
    `State: ${stateText(hypothesis)}`,
    `Type: ${hypothesis.type}`,
    `Placement: ${named(hypothesis.placement.id, hypothesis.placement.title, hypothesis.placement.is_removed)}`
    + (hypothesis.is_projected ? ' (shown on the filtered placement through its flow)' : ''),
    `Subject: ${subjectText(hypothesis)}`,
    `A/B Test: ${abTestText(hypothesis)}`,
];

/** One block of a list: what is needed to pick the next action. */
export const renderHypothesisSummary = (hypothesis: Hypothesis): string => head(hypothesis).join('\n');

/**
 * The row in full; a line whose value is empty is left out, except the ones of the summary. Who created
 * or resolved it, its backlog position and the other timestamps stay in --json.
 */
export const renderHypothesis = (hypothesis: Hypothesis): string => {
    const optional: [string, null | string | undefined][] = [
        ['Suggested Result', hypothesis.suggested_result],
        ['Judged By', hypothesis.judged_by],
        ['Stale', hypothesis.stale === 'fresh' || hypothesis.stale === 'not_applicable' ? null : hypothesis.stale],
        ['Legacy', hypothesis.is_legacy ? 'yes' : null],
        ['Parent', hypothesis.parent_hypothesis_id],
        ['Expected', expectedText(hypothesis)],
        ['Metrics Impact', hypothesis.metrics_impact.length === 0 ? null : hypothesis.metrics_impact.join(', ')],
        ['Rationale', hypothesis.rationale],
        ['Action', hypothesis.action],
        ['Media', hypothesis.media_url],
    ];

    const lines = [
        ...head(hypothesis),
        `Outcome: ${outcomeText(hypothesis)}`,
        ...optional.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `${label}: ${String(value)}`),
        `Source: ${hypothesis.source}`,
        `Created At: ${hypothesis.created_at}`,
        ...(hypothesis.resolved_at === null ? [] : [`Resolved At: ${hypothesis.resolved_at}`]),
    ];

    if (hypothesis.examples.length > 0) {
        lines.push('Examples:', ...hypothesis.examples.map(example => `  - ${example}`));
    }

    if (hypothesis.products.length > 0) {
        lines.push('Products:', ...hypothesis.products.map(product => productLine(product)));
    }

    return lines.join('\n');
};

const blocks = (rows: readonly Hypothesis[]): string => rows.map(row => renderHypothesisSummary(row)).join('\n---\n');

export const renderHypothesisPage = (page: Paginated<Hypothesis>): string => {
    const footer = renderFooter(page.meta.pagination);

    return page.data.length === 0 ? footer : `${blocks(page.data)}\n\n${footer}`;
};

export const renderHypothesisRows = (rows: { data: Hypothesis[] }): string =>
    (rows.data.length === 1 && rows.data[0] !== undefined ? renderHypothesis(rows.data[0]) : blocks(rows.data));

/**
 * The phases the server counts, in their order; it leaves `applied` out. A phase it starts to count
 * later gets a column after them.
 */
const ACCEPTED_PHASES = ['accepted', 'test_draft', 'testing', 'ended'];

const phaseLabel = (phase: string): string => {
    const text = phase.replaceAll('_', ' ');

    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

export const renderHypothesisSummaryTable = (summary: HypothesisSummary): string => {
    if (summary.data.length === 0) {
        return 'No hypotheses in the backlog.';
    }

    const extra = summary.data
        .flatMap(item => Object.keys(item.accepted_by_phase))
        .filter(phase => !ACCEPTED_PHASES.includes(phase));

    const phases = [...ACCEPTED_PHASES, ...new Set(extra)];
    const header = ['Placement', 'Proposed', ...phases.map(phase => phaseLabel(phase)), 'Need attention', 'Legacy', 'Projected'];

    const rows = summary.data.map(item => [
        item.placement_id,
        String(item.proposed),
        ...phases.map(phase => String(item.accepted_by_phase[phase] ?? 0)),
        String(item.attention_count),
        String(item.legacy_count),
        String(item.projected_count),
    ]);

    return table([header, ...rows]);
};

/**
 * Per item: created by this request, or already stored under that id, by an earlier run or by an
 * attempt of this one whose answer was lost.
 */
export const renderCreated = (created: CreatedHypotheses): string => created.data.map(item => [
    `${item.status === 201 ? 'Created' : 'Already stored'}: ${item.hypothesis_id}`,
    renderHypothesis(item.data),
].join('\n')).join('\n---\n');
