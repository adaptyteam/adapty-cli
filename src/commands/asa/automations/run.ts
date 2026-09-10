import { Args, Command, Flags } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaAutomationRunEnqueuedDTO } from '../../../lib/asa-schemas.js';

export default class AsaAutomationsRun extends Command {
    static override args = {
        automation_id: Args.string({ description: 'Automation rule ID (UUID)', required: true }),
    };

    static override description = 'Run an automation rule now; the run is queued, not awaited';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa automations run UUID',
        '<%= config.bin %> asa automations run UUID --dry-run',
    ];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
        'dry-run': Flags.boolean({ description: 'Evaluate and log the rule without touching Apple' }),
    };

    async run(): Promise<AsaAutomationRunEnqueuedDTO> {
        const { args, flags } = await this.parse(AsaAutomationsRun);

        if (!isValidUuid(args.automation_id)) {
            this.error('Invalid automation ID format.', { exit: 2 });
        }

        if (!flags['dry-run']) {
            await confirmMutation(
                this,
                {
                    method: 'POST',
                    path: `/automations/${args.automation_id}/run/`,
                    summary: 'Run the rule for real — it applies its actions to Apple',
                },
                flags.yes,
            );
        }

        const client = await createAsaClient(this);

        const { replayed, result } = await asaWrite<AsaAutomationRunEnqueuedDTO>(
            client,
            'post',
            `/automations/${args.automation_id}/run`,
            { idempotencyKey: flags['idempotency-key'], params: flags['dry-run'] ? { dry_run: 'true' } : undefined },
        );

        noteReplay(replayed, this.log.bind(this));

        if (!replayed) {
            this.log(flags['dry-run'] ? 'Dry run queued.' : 'Run queued.');
        }

        this.log(`Run ID: ${result.run_id ?? 'unknown'}`);
        this.log(`Follow it with: ${this.config.bin} asa automations runs ${args.automation_id}`);

        return result;
    }
}
