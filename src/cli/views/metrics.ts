import { csvLine } from './analytics/csv.js';

import type { Cell } from './analytics/csv.js';
import type { FilterValueNode, FilterValues } from '../../sdk/adapty/index.js';

/**
 * The metrics answers as text. A node of a tree or a row of a list has 21 (paywall) or 27 (flow)
 * numbers; the table shows the four that answer "is it working": views, purchases, trials and
 * revenue. `--json` and `--csv` have all of them. One renderer reads every kind of tree: a node is
 * typed by what the renderer reads, so a metric a kind does not have shows as `—`.
 */

const TOTAL = 'Total';
const INDENT = '  ';
const SEPARATOR = '  ';
const MISSING = '—';
const DATE_LENGTH = 'YYYY-MM-DD'.length;

type Column = { format: (value: number) => string; metric: 'purchases' | 'revenue' | 'trials' | 'views' };

const columns: readonly Column[] = [
    { format: String, metric: 'views' },
    { format: String, metric: 'purchases' },
    { format: String, metric: 'trials' },
    { format: value => value.toFixed(2), metric: 'revenue' },
];

type Line = { cells: string[]; label: string };

type ColumnValues = Partial<Record<(typeof columns)[number]['metric'], number>>;

/** What the renderer reads of a node: the metrics of a flow, a paywall or a placement tree all fit. */
type Node = ColumnValues & {
    items?: Node[];
    level?: string;
    period?: string;
    title?: string | null;
    values?: Node[];
};

type Tree = { data: Node };

const cellsOf = (node: ColumnValues): string[] =>
    columns.map(({ format, metric }) => {
        const value = node[metric];

        return typeof value === 'number' ? format(value) : MISSING;
    });

/** Labels left-aligned, numbers right-aligned in one column each, so a column reads straight down. */
const alignLines = (lines: readonly Line[]): string => {
    const labelWidth = Math.max(...lines.map(line => line.label.length));
    const widths = columns.map((_, index) => Math.max(...lines.map(line => line.cells[index]?.length ?? 0)));

    return lines
        .map(({ cells, label }) => {
            const numbers = columns.map(({ metric }, index) => `${metric} ${(cells[index] ?? '').padStart(widths[index] ?? 0)}`);

            return `${label.padEnd(labelWidth)}${SEPARATOR}${numbers.join(SEPARATOR)}`;
        })
        .join('\n');
};

/** A period node has no title, only a timestamp (`Z`, `.000Z` or an offset like `+02:00`): its label is the date. */
const nodeTitle = (node: Node): string => {
    if (node.period !== undefined) {
        return node.period.slice(0, DATE_LENGTH);
    }

    return node.title ?? MISSING;
};

/** Depth-first, a node first, then its period points, then its children while `level` is under `maxLevel`. */
const treeLines = (root: Node, maxLevel: number): Line[] => {
    const lines: Line[] = [];

    const visit = (node: Node, level: number, label: string): void => {
        lines.push({ cells: cellsOf(node), label: INDENT.repeat(level) + label });

        for (const point of node.values ?? []) {
            lines.push({ cells: cellsOf(point), label: INDENT.repeat(level + 1) + nodeTitle(point) });
        }

        if (level < maxLevel) {
            for (const child of node.items ?? []) {
                visit(child, level + 1, nodeTitle(child));
            }
        }
    };

    visit(root, 0, TOTAL);

    return lines;
};

/**
 * The tree of one entity: a Total line, then its children indented, `depth` levels down. The
 * period points of a node (when the request asked for periods) come right under it.
 */
export const renderMetricsTree = ({ data }: Tree, depth: number): string => alignLines(treeLines(data, depth));

/** The id a row of a `list` carries: `flow_id`, `paywall_id` or `placement_id`, by the entity. */
type RowIdKey = 'flow_id' | 'paywall_id' | 'placement_id';
type Row<K extends RowIdKey> = ColumnValues & Record<K, string>;

/** The lifetime rows of a `list`: the id of the entity, then the same four numbers. */
export const renderMetricsRows = <K extends RowIdKey>({ data }: { data: Row<K>[] }, idKey: K): string => {
    if (data.length === 0) {
        return 'No metrics for these IDs.';
    }

    return alignLines(data.map(row => ({ cells: cellsOf(row), label: row[idKey] })));
};

const PATH_SEPARATOR = ' > ';

/**
 * The metric columns are the numbers of the first node as the server sent them, in its order: the
 * CLI keeps no list of the metrics, so a metric the server adds shows up in the CSV by itself.
 */
const metricColumns = (node: object): string[] =>
    Object.entries(node).filter(([, value]) => typeof value === 'number').map(([name]) => name);

const valueOf = (node: object, name: string): Cell => (node as Record<string, Cell>)[name];

/**
 * `root` marks the root row only. A child with no `level` (every node of a paywall tree has none)
 * writes an empty cell (`undefined`: `""` would read as an empty level), not a level it does not have.
 */
const levelCell = (node: Node, path: readonly string[]): string | undefined => node.level ?? (path.length === 0 ? 'root' : undefined);

const treeRows = (root: Node, columns: readonly string[]): string[] => {
    const rows: string[] = [];

    const visit = (node: Node, path: readonly string[], title: string): void => {
        const here = [...path, title];

        const cells = columns.map(name => valueOf(node, name));

        rows.push(csvLine([here.join(PATH_SEPARATOR), levelCell(node, path), title, ...cells]));

        for (const point of node.values ?? []) {
            visit(point, here, nodeTitle(point));
        }

        for (const child of node.items ?? []) {
            visit(child, here, nodeTitle(child));
        }
    };

    visit(root, [], TOTAL);

    return rows;
};

/**
 * One row for each node of the whole tree, periods included: the path of titles from Total, the
 * level, the title, then the metrics.
 */
export const metricsTreeCsv = ({ data }: Tree): string => {
    const columns = metricColumns(data);

    return [csvLine(['path', 'level', 'title', ...columns]), ...treeRows(data, columns)].join('\n');
};

/** One row for each entity of a `list`: its id, then the metrics. */
export const metricsRowsCsv = <K extends RowIdKey>({ data }: { data: Row<K>[] }, idKey: K): string => {
    const columns = data[0] === undefined ? [] : metricColumns(data[0]);

    return [
        csvLine([idKey, ...columns]),
        ...data.map(row => csvLine([row[idKey], ...columns.map(name => valueOf(row, name))])),
    ].join('\n');
};

const valueLines = (node: FilterValueNode, level: number, lines: string[]): void => {
    lines.push(`${INDENT.repeat(level)}${node.label} (${node.value})`);

    for (const child of node.children ?? []) {
        valueLines(child, level + 1, lines);
    }
};

/** `label (value)`, nested as the server nests them: the top value is the key for `--filter key=value`. */
export const renderFilterValues = ({ data }: FilterValues): string => {
    if (data.length === 0) {
        return 'No filter values.';
    }

    const lines: string[] = [];

    for (const node of data) {
        valueLines(node, 0, lines);
    }

    return lines.join('\n');
};
