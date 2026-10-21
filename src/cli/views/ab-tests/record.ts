import { renderFooter } from '../list.js';

import type { AbTestDetail, AbTestSummary, FlowArmView, Paginated, PaywallArmView } from '../../../sdk/adapty/index.js';

const NONE = '—';

/** `[]` is the audience that every user belongs to; no list at all is a draft with no audience planned. */
export const audienceText = (segmentIds: null | readonly string[] | undefined): string => {
    if (segmentIds === null || segmentIds === undefined) {
        return NONE;
    }

    const [first] = segmentIds;

    return first === undefined ? 'All users' : `segment ${first}`;
};

const placementText = (placement: AbTestSummary['placement']): string => {
    if (placement === null) {
        return NONE;
    }

    return placement.title === null ? placement.placement_id : `${placement.title} (${placement.placement_id})`;
};

const armLine = (arm: FlowArmView | PaywallArmView): string => {
    const [id, name] = 'paywall_id' in arm ? [arm.paywall_id, arm.paywall_title] : [arm.flow_id, arm.flow_name];
    const content = name === null ? id : `${name} (${id})`;
    const parts = [content, `weight ${String(arm.weight)}`];

    if (arm.title !== null && arm.title !== '') {
        parts.push(`title ${arm.title}`);
    }

    if (arm.variation_id !== null) {
        parts.push(`variation ${arm.variation_id}`);
    }

    return `  - ${parts.join(', ')}`;
};

const summaryHead = (test: AbTestSummary): string[] => [`ID: ${test.ab_test_id}`, `Title: ${test.title}`];

/** Empty values show as a dash, so a label never vanishes. */
const summaryTail = (test: AbTestSummary): string[] => [
    `Type: ${test.type}`,
    `State: ${test.state}`,
    `Placement: ${placementText(test.placement)}`,
    `Audience: ${audienceText(test.segment_ids)}`,
    `Started At: ${test.started_at ?? NONE}`,
    `Stopped At: ${test.stopped_at ?? NONE}`,
];

/** One block of a list: the summary, nothing more. */
export const renderAbTestSummary = (test: AbTestSummary): string => [...summaryHead(test), ...summaryTail(test)].join('\n');

/** The test and its arms; the goal follows the title, the priority and the arms come last. */
export const renderAbTest = (test: AbTestDetail): string => {
    const lines = [
        ...summaryHead(test),
        ...(test.goal === '' ? [] : [`Goal: ${test.goal}`]),
        ...summaryTail(test),
        ...(test.priority === null ? [] : [`Priority: ${String(test.priority)}`]),
    ];

    const arms = [...test.paywalls, ...test.flows];

    if (arms.length > 0) {
        lines.push('Arms:', ...arms.map(arm => armLine(arm)));
    }

    return lines.join('\n');
};

/** Blocks with `---` between them, then the pagination footer, as every other list of the CLI. */
export const renderAbTestPage = (page: Paginated<AbTestSummary>): string => {
    const footer = renderFooter(page.meta.pagination);

    return page.data.length === 0
        ? footer
        : `${page.data.map(test => renderAbTestSummary(test)).join('\n---\n')}\n\n${footer}`;
};
