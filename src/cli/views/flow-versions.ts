import { hasPublishedHistory, versionDate, versionPublication } from '../../sdk/adapty/index.js';

import { renderRecord } from './record.js';

import type { Flow, FlowVersionDetail, FlowVersionRow, Paginated } from '../../sdk/adapty/index.js';

/**
 * The version history of a flow as text, and the words of its actions. The table has the title,
 * the state, the publish mark and the date of each row; `--json` has every field of the server.
 */

/** The text of the dashboard history panel before the first publish. */
export const EMPTY_HISTORY = 'History will appear after the first publish.';

/** Over the metrics of a flow that has no live version: the zeros are not results. */
export const NEVER_PUBLISHED = 'No data: the flow was never published.';

const NO_MATCH = 'No versions match the search.';
const HEADER = ['Title', 'State', 'Date', 'Version ID', 'Publish'];
const MARKS = { failed: 'Publish failed', publishing: 'Publishing…' } as const;

/** Every column left-aligned: the cells are words and ids, not numbers. */
const leftTable = (rows: readonly string[][]): string => {
    const widths = HEADER.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0)));

    return rows.map(row => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()).join('\n');
};

const versionRow = (row: FlowVersionRow): string[] => {
    const publication = versionPublication(row);

    return [row.title, row.state, versionDate(row), row.flow_version_id, publication === undefined ? '' : MARKS[publication]];
};

/**
 * Before the first publish the history is empty, as the dashboard says, and the draft is shown under
 * that text so that its id is at hand. A search with no match says so instead.
 */
export const renderVersionList = (page: Paginated<FlowVersionRow>, searched: boolean): string => {
    const rows = page.data;

    if (searched && rows.length === 0) {
        return NO_MATCH;
    }

    const table = rows.length === 0 ? [] : [leftTable([HEADER, ...rows.map(row => versionRow(row))])];

    return searched || hasPublishedHistory(rows) ? table.join('\n') : [EMPTY_HISTORY, ...table].join('\n');
};

/**
 * One version without its content: the content is long, `--json` and `--output` have it. After a
 * write to a file the pointer to `--output` is left out: the file is there.
 */
export const renderVersion = (version: FlowVersionDetail, written = false): string => {
    const publication = versionPublication(version);

    return [
        renderRecord({
            title: version.title,
            flow_version_id: version.flow_version_id,
            version: version.version,
            state: version.state,
            publish: publication === undefined ? undefined : MARKS[publication],
            date: versionDate(version),
            last_edited_by: version.last_edited_by,
            preview_url: version.preview_url,
        }),
        ...(written ? [] : ['', 'The content of the version: --json prints it, --output <file> writes it.']),
    ].join('\n');
};

/** `2026-11-09 10:15 UTC`: a content time in milliseconds, as a person reads it. */
export const contentTime = (ms: number): string => {
    const date = new Date(ms);

    return Number.isNaN(date.getTime()) ? String(ms) : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

/** The question before a restore that replaces the draft. */
export const replaceDraftQuestion = (draft: FlowVersionRow, versionTitle: string): string => {
    const editor = draft.last_edited_by ?? 'another user';

    return `Replace the draft '${draft.title}' (last change ${contentTime(draft.updated_at)} by ${editor}) `
        + `with '${versionTitle}'? To keep the draft, duplicate it to a new flow first.`;
};

/**
 * The same question when nobody can answer it: the way to answer in the command, with the token of
 * the draft from the list that was just read. `--yes` alone would only be refused again.
 */
export const replaceDraftRefusal = (draft: FlowVersionRow, versionTitle: string): string =>
    `${replaceDraftQuestion(draft, versionTitle)}\n`
    + `To replace it, re-run with --yes --expected-updated-at ${draft.updated_at} (the draft's updated_at).`;

export const restoredLine = (versionTitle: string, draft: Pick<FlowVersionRow, 'flow_version_id' | 'title'>): string =>
    `Restored '${versionTitle}' as the draft '${draft.title}' (${draft.flow_version_id}). Nothing is published.`;

export const renamedLine = (row: Pick<FlowVersionRow, 'flow_version_id' | 'title'>): string =>
    `Version ${row.flow_version_id} is now '${row.title}'.`;

/** One line under the table for each never-published flow of a `flows metrics list`. */
export const neverPublishedLines = (flowIds: readonly string[]): string[] =>
    flowIds.map(flowId => `${flowId}: ${NEVER_PUBLISHED}`);

export const duplicatedLine = (flow: Pick<Flow, 'id' | 'name'>): string => `New flow '${flow.name}' (${flow.id}), not published.`;
