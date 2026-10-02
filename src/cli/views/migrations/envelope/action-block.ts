import type { Action } from '../../../../sdk/adapty/index.js';

const knownKinds = new Set<string>(['external', 'input', 'upload']);

const indent = (text: string, pad: string): string => {
    return text.split('\n').map(line => `${pad}${line}`).join('\n');
};

export const actionBlock = (action: Action, migrationId: string): string[] => {
    const lines = [`  ${action.action_id}  (${action.kind})  ${action.title}`];
    const href = 'href' in action ? action.href : undefined;

    if (action.detail !== null) {
        lines.push(indent(action.detail, '    '));
    }

    if (href !== undefined) {
        lines.push(`    ${href}`);
    }

    if (action.reads.length > 0) {
        const commands = action.reads.map(name => `adapty migrations show ${name} -m ${migrationId}`);

        lines.push(`    Read first: ${commands.join(', ')}`);
    }

    if (action.confirm !== null) {
        lines.push('    Confirmation:', indent(action.confirm, '      '));

        if (action.kind === 'input') {
            lines.push('    Review this text before passing --yes.');
        }
    }

    if (action.kind === 'upload') {
        lines.push('    File uploads are not supported by this CLI.');
        lines.push('    Use the dashboard or an offered Cloud Export action.');
    }

    if (!knownKinds.has(action.kind)) {
        lines.push('    This action needs a newer adapty-cli');
    }

    return lines;
};
