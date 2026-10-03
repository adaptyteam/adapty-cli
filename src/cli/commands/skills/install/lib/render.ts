import { agents, fallback, FALLBACK_COMMAND } from './agents.js';

import type { InstallResult } from './agents.js';

const known = [...agents, fallback];

const nameOf = (result: InstallResult): string => known.find(agent => agent.id === result.agent)?.name ?? result.agent;

export const renderInstall = (results: InstallResult[]): string => {
    const lines = results.map((result) => {
        if (!result.installed) {
            return `✗ ${nameOf(result)}: ${result.error ?? 'not installed'}`;
        }

        const installed = `✓ ${nameOf(result)}: installed. Restart it to load the skills.`;

        return result.warning === undefined ? installed : `${installed}\n  Warning: ${result.warning}`;
    });

    if (results.some(result => result.agent === fallback.id)) {
        return lines.join('\n');
    }

    return [...lines, '', `Another agent? Run \`${FALLBACK_COMMAND}\`.`].join('\n');
};
