import { csvLine } from '../csv.js';
import { DATE_LENGTH, INDENT, MISSING, nodeTitle, PATH_SEPARATOR, SEPARATOR, TOTAL, valueOf } from '../metrics.js';

import type { AbMetricsNode, AbTestMetricsDetail, AbTestMetricsRows, AbTestMetricsTotal } from '../../../sdk/adapty/index.js';
import type { Cell } from '../csv.js';

/**
 * The A/B test metrics as text: one table of arms, whatever the number of arms. A node has up to 27
 * numbers; the table shows what answers "which arm is ahead": the weight, the revenue, the
 * purchases, the views, the P2BB (the chance, in percent, that the arm is the best by revenue per
 * viewer), the 99 % range of revenue per 1,000 unique viewers and the p-value. `--json` and `--csv`
 * have all of them.
 */

/** Below this many payers the server does not model the range: it is 0, the mean and two times the mean. */
const MIN_PAYERS = 50;
const NOTE = `Fewer than ${String(MIN_PAYERS)} payers on an arm: its range is 0 / mean / 2 × mean.`;

const HEADERS = [
    'weight',
    'revenue',
    'purchases',
    'views',
    'P2BB %',
    'per 1K viewers, 99 % (low / mean / high)',
    'p-value',
];

type Line = { cells: string[]; label: string };

const isNumber = (value: unknown): value is number => typeof value === 'number';

const fixed = (digits: number) => (value: number | undefined): string =>
    (isNumber(value) ? value.toFixed(digits) : MISSING);

const range = ({ average_per_1000: mean, low_boundary: low, upper_boundary: high }: AbMetricsNode): string => {
    if (!isNumber(mean)) {
        return MISSING;
    }

    if (!isNumber(low) || !isNumber(high)) {
        return mean.toFixed(2);
    }

    return [low, mean, high].map(value => value.toFixed(2)).join(' / ');
};

const cellsOf = (node: AbMetricsNode): string[] => [
    isNumber(node.weight) ? String(node.weight) : MISSING,
    fixed(2)(node.revenue),
    isNumber(node.purchases) ? String(node.purchases) : MISSING,
    isNumber(node.views) ? String(node.views) : MISSING,
    fixed(2)(node.probability),
    range(node),
    fixed(3)(node.p_value ?? undefined),
];

/** A period point has no title, only a timestamp (`Z`, `.000Z` or an offset like `+02:00`): its label is the date. */
const labelOf = (node: AbMetricsNode): string => {
    if (node.period !== undefined) {
        return nodeTitle(node);
    }

    return node.title ?? node.paywall?.title ?? node.paywall_id ?? node.variation_id ?? node.flow_id ?? MISSING;
};

/** The labels left-aligned, the numbers right-aligned in one column each, under one header row. */
const table = (lines: readonly Line[]): string => {
    const all: Line[] = [{ cells: HEADERS, label: '' }, ...lines];
    const labelWidth = Math.max(...all.map(line => line.label.length));
    const widths = HEADERS.map((_, index) => Math.max(...all.map(line => line.cells[index]?.length ?? 0)));

    return all
        .map(({ cells, label }) => {
            const numbers = cells.map((cell, index) => cell.padStart(widths[index] ?? 0));

            return [label.padEnd(labelWidth), ...numbers].join(SEPARATOR).trimEnd();
        })
        .join('\n');
};

/** An arm, its period points right under it, then its children (products, screens) while `level` is under `depth`. */
const armLines = (arm: AbMetricsNode, depth: number, level: number, lines: Line[]): void => {
    lines.push({ cells: cellsOf(arm), label: INDENT.repeat(level) + labelOf(arm) });

    for (const point of arm.values ?? []) {
        lines.push({ cells: cellsOf(point), label: INDENT.repeat(level + 1) + labelOf(point) });
    }

    if (level < depth) {
        for (const child of arm.items ?? []) {
            armLines(child, depth, level + 1, lines);
        }
    }
};

const hasRange = (arm: AbMetricsNode): boolean => isNumber(arm.low_boundary) && isNumber(arm.upper_boundary);

const fewPayers = (arm: AbMetricsNode): boolean => (arm.unique_paid_subscribers ?? MIN_PAYERS) < MIN_PAYERS;

const withNote = (text: string, arms: readonly AbMetricsNode[]): string =>
    (arms.some(arm => hasRange(arm) && fewPayers(arm)) ? `${text}\n${NOTE}` : text);

/** One Total line per test, from the numbers of the test itself (never a sum of its arms), then its arms. */
export const renderAbTestRows = ({ data }: AbTestMetricsRows): string => {
    if (data.length === 0) {
        return 'No metrics for these IDs.';
    }

    const lines: Line[] = [];

    for (const test of data) {
        lines.push({ cells: cellsOf(test), label: `${test.ab_test_id}  ${TOTAL}` });

        for (const arm of test.items ?? []) {
            armLines(arm, 1, 1, lines);
        }
    }

    return withNote(table(lines), data.flatMap(test => test.items ?? []));
};

type Day = null | string | undefined;

const dayText = (word: string, day: Day): string | undefined => (day === null || day === undefined ? undefined : `${word} ${day.slice(0, DATE_LENGTH)}`);

/** The test title, its state and its dates, on one line over the table. */
const head = (title: string | undefined, state: string | undefined, startedAt: Day, stoppedAt?: Day): string =>
    [title ?? MISSING, state, dayText('started', startedAt), dayText('stopped', stoppedAt)]
        .filter((part): part is string => part !== undefined)
        .join(SEPARATOR);

const armsOf = (data: AbTestMetricsDetail['data']): AbMetricsNode[] => data.metrics ?? data.items ?? [];

/** The arms of the window, with no Total line: a paywall answer has none, and the flow results page removes it. */
export const renderAbTestDetail = ({ data }: AbTestMetricsDetail, depth: number): string => {
    const arms = armsOf(data);
    const lines: Line[] = [];

    for (const arm of arms) {
        armLines(arm, depth, 1, lines);
    }

    const title = data.ab_test?.title ?? data.title ?? undefined;

    return withNote(`${head(title, data.state, data.started_at)}\n${table(lines)}`, arms);
};

/** The arms over the whole life of the test, with no Total line. */
export const renderAbTestTotal = ({ data }: AbTestMetricsTotal): string => {
    const lines = data.metrics.map((arm): Line => ({ cells: cellsOf(arm), label: INDENT + labelOf(arm) }));

    return withNote(`${head(data.ab_test.title, data.state, data.started_at, data.stopped_at)}\n${table(lines)}`, data.metrics);
};

/**
 * One fixed set of columns for a paywall and a flow test, so a script reads both with one header: the
 * 27 metrics, `users` and `installs`, then what an arm adds. A type that has no value leaves the cell
 * empty. `--json` has everything else. A fixed list, unlike `metricColumns` of the tree view, which reads
 * the first node: here the header must not depend on the type of the test.
 */
const csvColumns = [
    'views', 'unique_profiles_views', 'total_completions', 'total_uniq_completions', 'from_start_conversion',
    'revenue', 'proceeds', 'net_revenue', 'purchases', 'trials', 'unique_subscribers', 'unique_paid_subscribers',
    'arppu', 'arpu', 'conversion_rate_purchases', 'conversion_rate_trials', 'trials_cancelled', 'refunds', 'arpas',
    'apppu', 'appas', 'conversion_rate_refunds', 'conversion_rate_purchases_by_users', 'conversion_rate_trials_by_users',
    'conversion_rate_trial_paid', 'trials_finished', 'trials_paid', 'users', 'installs',
    'weight', 'probability', 'low_boundary', 'average_per_1000', 'upper_boundary', 'p_value',
];

/**
 * The ids and the flag of a node, in the same columns for every type, so a row matches `--json`: the
 * paywall of a paywall arm; the variation, the flow, the screen and the product of a flow node.
 */
const idColumns = ['paywall_id', 'variation_id', 'flow_id', 'screen_id', 'product_id', 'in_current_state'];

const idCells = (node: AbMetricsNode): Cell[] => idColumns.map(name => valueOf(node, name));

/** One row for each test and each of its arms: the test id, the level, the arm, the ids, then the numbers. */
export const abTestRowsCsv = ({ data }: AbTestMetricsRows): string => {
    const row = (id: string, level: string, label: string, node: AbMetricsNode): string =>
        csvLine([id, level, label, ...idCells(node), ...csvColumns.map(name => valueOf(node, name))]);

    const rows = data.flatMap(test => [
        row(test.ab_test_id, 'test', '', test),
        ...(test.items ?? []).map(arm => row(test.ab_test_id, 'arm', labelOf(arm), arm)),
    ]);

    return [csvLine(['ab_test_id', 'level', 'arm', ...idColumns, ...csvColumns]), ...rows].join('\n');
};

/**
 * One row for each node under the test, periods included: the path from the root, the level, the
 * title, the ids, the numbers. A flow answer is a tree and its root (the test) has a row; a paywall
 * answer has only arms, so no root row.
 */
export const abTestDetailCsv = ({ data }: AbTestMetricsDetail): string => {
    const nodes: { level: string; node: AbMetricsNode; path: string }[] = [];

    const visit = (node: AbMetricsNode, path: readonly string[], fallbackLevel: string): void => {
        const here = [...path, labelOf(node)];

        nodes.push({ level: node.level ?? fallbackLevel, node, path: here.join(PATH_SEPARATOR) });

        for (const point of node.values ?? []) {
            visit(point, here, 'period');
        }

        for (const child of node.items ?? []) {
            visit(child, here, 'node');
        }
    };

    if (data.metrics === undefined) {
        visit(data, [], 'root');
    } else {
        for (const arm of data.metrics) {
            visit(arm, [], 'arm');
        }
    }

    const rows = nodes.map(({ level, node, path }) =>
        csvLine([path, level, labelOf(node), ...idCells(node), ...csvColumns.map(name => valueOf(node, name))]));

    return [csvLine(['path', 'level', 'title', ...idColumns, ...csvColumns]), ...rows].join('\n');
};
