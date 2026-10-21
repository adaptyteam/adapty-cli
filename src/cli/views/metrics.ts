import type { FilterValueNode, FilterValues, Metrics, MetricsNode, MetricsTree } from '../../sdk/adapty/index.js';

/**
 * The metrics answers as text. A node of a tree or a row of a list has 27 numbers; the table shows
 * the four that answer "is it working": views, purchases, trials and revenue. `--json` and `--csv`
 * have all of them.
 */

const TOTAL = 'Total';
const INDENT = '  ';
const SEPARATOR = '  ';
const MISSING = '—';

type Column = { format: (value: number) => string; metric: 'purchases' | 'revenue' | 'trials' | 'views' };

const columns: readonly Column[] = [
    { format: String, metric: 'views' },
    { format: String, metric: 'purchases' },
    { format: String, metric: 'trials' },
    { format: value => value.toFixed(2), metric: 'revenue' },
];

type Line = { cells: string[]; label: string };

const cellsOf = (node: Partial<Record<(typeof columns)[number]['metric'], number>>): string[] =>
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

/** A period node has no title, only the timestamp; the time of day carries nothing at day or more. */
const nodeTitle = (node: MetricsNode): string => {
    if (node.period !== undefined) {
        return node.period.replace(/T00:00:00(?:\.0+)?Z$/, '');
    }

    return node.title ?? MISSING;
};

/** Depth-first, a node first, then its period points, then its children while `level` is under `maxLevel`. */
const treeLines = (root: MetricsNode, maxLevel: number): Line[] => {
    const lines: Line[] = [];

    const visit = (node: MetricsNode, level: number, label: string): void => {
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
export const renderMetricsTree = ({ data }: MetricsTree, depth: number): string => alignLines(treeLines(data, depth));

/** The id a row of a `list` carries: a flow row has `flow_id`, a placement row `placement_id`. */
type RowIdKey = 'flow_id' | 'placement_id';
type Row<K extends RowIdKey> = Metrics & Record<K, string>;

/** The lifetime rows of a `list`: the id of the entity, then the same four numbers. */
export const renderMetricsRows = <K extends RowIdKey>({ data }: { data: Row<K>[] }, idKey: K): string => {
    if (data.length === 0) {
        return 'No metrics for these IDs.';
    }

    return alignLines(data.map(row => ({ cells: cellsOf(row), label: row[idKey] })));
};

/** RFC 4180: quote a cell that holds a comma, a quote or a line break. */
const csvCell = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }

    const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvLine = (cells: readonly unknown[]): string => cells.map(cell => csvCell(cell)).join(',');

const PATH_SEPARATOR = ' > ';

/**
 * The metric columns are the numbers of the first node as the server sent them, in its order: the
 * CLI keeps no list of the metrics, so a metric the server adds shows up in the CSV by itself.
 */
const metricColumns = (node: object): string[] =>
    Object.entries(node).filter(([, value]) => typeof value === 'number').map(([name]) => name);

const valueOf = (node: object, name: string): unknown => (node as Record<string, unknown>)[name];

const treeRows = (root: MetricsNode, columns: readonly string[]): string[] => {
    const rows: string[] = [];

    const visit = (node: MetricsNode, path: readonly string[], title: string): void => {
        const here = [...path, title];

        rows.push(csvLine([here.join(PATH_SEPARATOR), node.level ?? 'root', title, ...columns.map(name => valueOf(node, name))]));

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
 * level, the title, then the 27 metrics.
 */
export const metricsTreeCsv = ({ data }: MetricsTree): string => {
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
