import { Flags } from '@oclif/core';

import { BaseCommand } from '../../../base/base-command.js';
import { CliError, exitCode } from '../../../errors.js';

import { agentIds, agents, fallback, install, onPath, runQuietly } from './lib/agents.js';
import { choose } from './lib/choose.js';
import { renderInstall } from './lib/render.js';

import type { Agent, InstallResult } from './lib/agents.js';

export default class SkillsInstall extends BaseCommand {
    static override description = 'Install the Adapty skills into the coding agents on this machine';
    static override examples = [
        '<%= config.bin %> skills install',
        '<%= config.bin %> skills install --agent claude-code',
        '<%= config.bin %> skills install --yes',
    ];

    static override flags = {
        agent: Flags.option({
            description: 'Install into this agent only. Repeat for several.',
            multiple: true,
            options: agentIds,
        })(),
        yes: Flags.boolean({
            char: 'y',
            description: 'Install into every agent found without asking; required when several are found and no one can answer',
        }),
    };

    async run(): Promise<InstallResult[]> {
        const { flags } = await this.parse(SkillsInstall);

        const named = flags.agent !== undefined;
        const chosen = named ? agents.filter(agent => flags.agent?.includes(agent.id)) : agents;
        const results: InstallResult[] = [];
        const found: Agent[] = [];

        for (const agent of chosen) {
            if (await onPath(agent.bin)) {
                found.push(agent);
            } else if (named) {
                results.push({ agent: agent.id, error: `\`${agent.bin}\` is not on PATH`, installed: false });
            }
        }

        for (const agent of await this.targets({ found, named, yes: flags.yes })) {
            results.push(await install(agent, runQuietly));
        }

        this.render(results, renderInstall);

        if (results.some(result => !result.installed)) {
            process.exitCode = 1;
        }

        return results;
    }

    private async targets({ found, named, yes }: { found: Agent[]; named: boolean; yes: boolean }): Promise<Agent[]> {
        if (found.length === 0 && !named) {
            if (!(await onPath(fallback.bin))) {
                const bins = agents.map(agent => `\`${agent.bin}\``).join(', ');

                throw new CliError(`Found none of ${bins}, and no \`npx\` to run the skills CLI with.`, 1, 'no_agent_found');
            }

            return [fallback];
        }

        if (named || yes || found.length === 1) {
            return found;
        }

        if (!this.interactive || !process.stdin.isTTY) {
            const names = found.map(agent => agent.name).join(', ');

            throw new CliError(
                `Found ${names}. Choose with --agent, or pass --yes to install into all of them.`,
                exitCode.usage,
                'agent_choice_required',
            );
        }

        return choose(found, this.signal);
    }
}
