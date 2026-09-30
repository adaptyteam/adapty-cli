import { agents, fallback, FALLBACK_COMMAND } from '../../../../agents/index.js';

import type { InstallResult } from '../../../../agents/index.js';

const known = [...agents, fallback];

const nameOf = (result: InstallResult): string => known.find(agent => agent.id === result.agent)?.name ?? result.agent;

export const renderInstall = (results: InstallResult[]): string => {
    const lines = results.map(result => (result.installed
        ? `✓ ${nameOf(result)}: installed. Restart it to load the skills.`
        : `✗ ${nameOf(result)}: ${result.error ?? 'not installed'}`));

    if (results.some(result => result.agent === fallback.id)) {
        return lines.join('\n');
    }

    return [...lines, '', `Another agent? Run \`${FALLBACK_COMMAND}\`.`].join('\n');
};
