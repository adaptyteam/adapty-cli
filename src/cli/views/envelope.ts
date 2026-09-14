import type { Action, Envelope, Issue, Migration, Progress } from '../../sdk/adapty/index.js';

/**
 * The envelope as a human reads it: where the migration is, what is wrong, what to do next. Every
 * command of the topic answers with this same object, so the view is shared rather than owned by
 * one command.
 *
 * The server writes the texts (`summary`, `detail`, `confirm` are CommonMark) and this prints them
 * as they came: a new step, action or wording must not need a CLI release.
 */
export const renderEnvelope = (envelope: Envelope): string => {
    const { migration } = envelope;

    const lines = [
        `${migration.id}  ${migration.flow}  ${migration.state}`,
        appLine(migration.app),
        migration.summary,
    ];

    if (migration.progress !== null) {
        lines.push(progressLine(migration.progress));
    }

    if (envelope.issues.length > 0) {
        lines.push('', 'Issues:', ...envelope.issues.flatMap(issue => issueBlock(issue)));
    }

    if (envelope.next_actions.length > 0) {
        lines.push('', 'Do next:', ...envelope.next_actions.flatMap(action => actionBlock(action)));
    }

    if (envelope.available_actions.length > 0) {
        lines.push('', 'Also available:', ...envelope.available_actions.flatMap(action => actionBlock(action)));
    }

    if (envelope.resources.length > 0) {
        lines.push('', `Readable now: ${envelope.resources.map(resource => resource.name).join(', ')}`);
    }

    return lines.join('\n');
};

/** Section 4.6: a kind this build never heard of is not an error, it is an older CLI. */
const knownKinds = new Set<string>(['external', 'input', 'upload']);

const indent = (text: string, pad: string): string =>
    text.split('\n').map(line => `${pad}${line}`).join('\n');

/** Null until the main flow creates it, which is most of a new migration's life. */
const appLine = (app: Migration['app']): string =>
    (app === null ? 'App: not created yet' : `App: ${app.name} (${app.id})`);

const progressLine = (progress: Progress): string => {
    const done = progress.total === null ? String(progress.done) : `${progress.done} of ${progress.total}`;

    return `Progress: ${done} ${progress.unit}`;
};

const issueBlock = (issue: Issue): string[] => {
    const lines = [`  ${issue.title}  (${issue.code})`];

    if (issue.detail !== null) {
        lines.push(indent(issue.detail, '    '));
    }

    if (issue.action_id !== null) {
        lines.push(`    Fix with: adapty migrations run ${issue.action_id}`);
    }

    return lines;
};

const actionBlock = (action: Action): string[] => {
    const lines = [`  ${action.action_id}  (${action.kind})  ${action.title}`];
    // `href` belongs to the external branch only, so the union is asked before it is read
    const href = 'href' in action ? action.href : undefined;

    if (action.detail !== null) {
        lines.push(indent(action.detail, '    '));
    }

    if (href !== undefined) {
        lines.push(`    ${href}`);
    }

    if (action.reads.length > 0) {
        lines.push(`    Read first: ${action.reads.map(name => `adapty migrations show ${name}`).join(', ')}`);
    }

    if (action.confirm !== null) {
        lines.push('    Changes production data: needs --yes');
    }

    if (!knownKinds.has(action.kind)) {
        lines.push('    This action needs a newer adapty-cli');
    }

    return lines;
};
