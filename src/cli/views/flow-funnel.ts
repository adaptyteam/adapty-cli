import type { FlowFunnelAnswer, FlowFunnelScreen, FlowFunnelStep } from '../../sdk/adapty/index.js';

/**
 * The screen funnel of a flow as text: what the Funnel tab of the dashboard shows. A summary line,
 * then one row for each step and, under a step that has more than one screen, one row for each of
 * its screens. `--json` and `--csv` have every field; the table has the main numbers. A value the
 * server calls `null` (a rate that does not apply, the revenue of an onboarding screen) prints as
 * `—`, and a rate is not 0.
 */

const MISSING = '—';
const SEPARATOR = '  ';
const SCREEN_INDENT = '    ';
const HEADER = ['Step', 'Type', 'Reached', 'Completed', 'Drop rate', 'Revenue'];

/** What the request said and the answer does not: the period and the date type. */
export type FlowFunnelContext = {
    dateFrom: string;
    dateTo: string;
    dateType: string;
    /** Whether the user named the version; without one the server read the published version. */
    versionGiven: boolean;
};

const count = (value: null | number): string => (value === null ? MISSING : String(value));

const money = (value: null | number): string => (value === null ? MISSING : value.toFixed(2));

/** `8 (66.67%)`: the count, then its rate when there is one. */
const withRate = (value: null | number, rate: null | number): string =>
    (value === null || rate === null ? count(value) : `${value} (${rate}%)`);

const screenRow = (screen: FlowFunnelScreen): string[] => [
    SCREEN_INDENT + screen.title,
    screen.screen_type,
    count(screen.reached),
    count(screen.completed),
    count(screen.drop_off),
    money(screen.revenue),
];

const stepRows = (step: FlowFunnelStep): string[][] => {
    const [only, ...others] = step.screens;
    const single = only !== undefined && others.length === 0;

    const row = [
        single ? `${step.step_order} ${only.title}` : `${step.step_order} ${step.screens.length} screens`,
        single ? only.screen_type : '',
        withRate(step.reached, step.reached_rate),
        count(step.completed),
        withRate(step.drop_off, step.drop_off_rate),
        money(step.revenue),
    ];

    return single ? [row] : [row, ...step.screens.map(screen => screenRow(screen))];
};

const alignRows = (rows: readonly string[][]): string => {
    const widths = HEADER.map((_, index) => Math.max(...rows.map(row => row[index]?.length ?? 0)));

    return rows
        .map(row => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(SEPARATOR).trimEnd())
        .join('\n');
};

/** A period without users has no steps: the screens of the version, all zeros, in builder order. */
const emptyRows = ({ data }: FlowFunnelAnswer): string[][] =>
    data.version_screens.map(screen => [screen.title, screen.screen_type, '0', '0', '0', screen.screen_type === 'paywall' ? '0.00' : MISSING]);

export const renderFlowFunnel = (answer: FlowFunnelAnswer, context: FlowFunnelContext): string => {
    const { steps, summary, version } = answer.data;
    const published = context.versionGiven ? '' : ' (published)';
    const dateType = context.dateType.replaceAll('_', ' ');

    const lines = [
        `Flow version ${version}${published} · ${context.dateFrom} to ${context.dateTo} · ${dateType}`,
        [
            `Entered ${summary.entered}`,
            `Completed ${withRate(summary.completed, summary.completion_rate)}`,
            `Drop rate ${withRate(summary.dropped, summary.drop_rate)}`,
            `Revenue ${money(summary.revenue)}`,
        ].join(' · '),
        '',
    ];

    if (steps.length === 0) {
        lines.push('No users entered this flow in this period. The screens of the version:', '');
    }

    const rows = steps.length === 0 ? emptyRows(answer) : steps.flatMap(step => stepRows(step));

    lines.push(alignRows([HEADER, ...rows]));

    return lines.join('\n');
};
