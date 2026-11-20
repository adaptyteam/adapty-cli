import { renderRecord } from './record.js';

/** The suggestion lists have no pages: every item a labelled block, `---` between them. */
export const renderItems = (answer: { data: readonly object[] }): string => (answer.data.length === 0
    ? 'No suggestions.'
    : answer.data.map(item => renderRecord(item)).join('\n---\n'));

/** What a write answers: one line that says what was done, then the message. */
export const renderWritten = (line: string) => (answer: { data: object }): string => `${line}\n${renderRecord(answer.data)}`;

/** The sentence that each question of the topic ends with: an agent shows the text and waits for a yes. */
export const ASK_THE_USER = 'Show this text to the user and wait for a clear yes before you re-run with --yes.';
