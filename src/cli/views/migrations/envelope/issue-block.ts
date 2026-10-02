import type { Issue } from '../../../../sdk/adapty/index.js';

const indent = (text: string, pad: string): string => {
    return text.split('\n').map(line => `${pad}${line}`).join('\n');
};

export const issueBlock = (issue: Issue, migrationId: string): string[] => {
    const lines = [`  ${issue.title}  (${issue.code})`];

    if (issue.detail !== null) {
        lines.push(indent(issue.detail, '    '));
    }

    if (issue.action_id !== null) {
        lines.push(`    Fix with: adapty migrations run ${issue.action_id} -m ${migrationId}`);
    }

    return lines;
};
