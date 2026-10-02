import { actionBlock } from './action-block.js';
import { issueBlock } from './issue-block.js';

import type { Envelope, Migration, MigrationState, Progress } from '../../../../sdk/adapty/index.js';

const knownStates = new Set<string>([
    'running', 'action_required', 'completed', 'failed', 'canceled',
] satisfies MigrationState[]);

const appLine = (app: Migration['app']): string => {
    return app === null ? 'App: not created yet' : `App: ${app.name} (${app.id})`;
};

const progressLine = (progress: Progress): string => {
    const done = progress.total === null ? String(progress.done) : `${progress.done} of ${progress.total}`;

    return `Progress: ${done} ${progress.unit}`;
};

/** Preserve server wording so new steps and actions need no CLI update. */
export const renderEnvelope = (envelope: Envelope): string => {
    const { migration } = envelope;

    const lines = [
        `${migration.id}  ${migration.flow}  ${migration.state}`,
        appLine(migration.app),
        migration.summary,
    ];

    if (!knownStates.has(migration.state)) {
        lines.push('This migration state needs a newer adapty-cli');
    }

    if (migration.progress !== null) {
        lines.push(progressLine(migration.progress));
    }

    if (envelope.issues.length > 0) {
        lines.push('', 'Issues:', ...envelope.issues.flatMap(issue => issueBlock(issue, migration.id)));
    }

    if (envelope.next_actions.length > 0) {
        lines.push('', 'Do next:', ...envelope.next_actions.flatMap(action => actionBlock(action, migration.id)));
    }

    if (envelope.available_actions.length > 0) {
        lines.push('', 'Also available:', ...envelope.available_actions.flatMap(action => actionBlock(action, migration.id)));
    }

    if (envelope.resources.length > 0) {
        lines.push('', `Readable now: ${envelope.resources.map(resource => resource.name).join(', ')}`);
    }

    return lines.join('\n');
};
