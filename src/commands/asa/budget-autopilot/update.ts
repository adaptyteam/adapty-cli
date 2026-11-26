import { Command, Flags } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { printResponse } from '../../../lib/output.js';

import type { ApiClient } from '../../../lib/api-client.js';
import type { AsaBudgetAutopilotFrontsDTO, AsaBudgetAutopilotStatusDTO } from '../../../lib/asa-schemas.js';

const PREVIEW_MAX_LINES = 20;

const LIVE_WARNING
    = 'In Live the budget autopilot writes to Apple Ads: its weekly run changes campaign daily budgets, and its spend guard can pause campaigns. It never resumes a campaign it paused and never changes bids.';

export default class AsaBudgetAutopilotUpdate extends Command {
    static override description
        = 'Turn the budget autopilot on or off and choose its mode (dry_run plans and writes nothing to Apple Ads, the dashboard calls it Preview; live writes budget changes and pauses)';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa budget-autopilot update --mode live',
        '<%= config.bin %> asa budget-autopilot update --enable --mode dry_run',
        '<%= config.bin %> asa budget-autopilot update --disable',
    ];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
        disable: Flags.boolean({ description: 'Turn the budget autopilot off; the mode is kept', exclusive: ['enable'] }),
        enable: Flags.boolean({ description: 'Turn the budget autopilot on', exclusive: ['disable'] }),
        mode: Flags.string({
            description: 'dry_run (plan only, nothing is written to Apple Ads) or live (writes budget changes and pauses)',
            options: ['dry_run', 'live'],
        }),
    };

    async run(): Promise<AsaBudgetAutopilotStatusDTO> {
        const { flags } = await this.parse(AsaBudgetAutopilotUpdate);

        if (!flags.enable && !flags.disable && flags.mode === undefined) {
            this.error('Nothing to change: pass --enable, --disable or --mode.', { exit: 2 });
        }

        const client = await createAsaClient(this);
        const status = await client.get<AsaBudgetAutopilotStatusDTO>('/budget-autopilot/status');

        if (!status.enrolled) {
            this.error('The company is not connected to the budget autopilot, so there is nothing to update.', { exit: 1 });
        }

        const body = {
            dry_run: flags.mode === undefined ? status.dry_run : flags.mode === 'dry_run',
            enabled: flags.enable || (status.enabled && !flags.disable),
        };

        if (body.enabled === status.enabled && body.dry_run === status.dry_run) {
            this.log('Nothing to change: the budget autopilot is already set this way.');

            return status;
        }

        const isLive = body.enabled && !body.dry_run;

        if (isLive) {
            if (!status.live_available) {
                this.error('Live mode is not available for this company right now.', { exit: 1 });
            }

            await this.previewLive(client);
        }

        await confirmMutation(
            this,
            { body, method: 'PUT', path: '/budget-autopilot/settings/', summary: this.summaryFor(body, status.enabled) },
            flags.yes,
        );

        const { replayed, result } = await asaWrite<AsaBudgetAutopilotStatusDTO>(client, 'put', '/budget-autopilot/settings', {
            body,
            idempotencyKey: flags['idempotency-key'],
        });

        noteReplay(replayed, this.log.bind(this));

        if (!replayed) {
            this.log('Budget autopilot updated.');
        }

        printResponse(result, this.log.bind(this));

        return result;
    }

    private async previewLive(client: ApiClient): Promise<void> {
        const { items } = await client.get<AsaBudgetAutopilotFrontsDTO>('/budget-autopilot/fronts');
        const managed = items.filter(item => item.excluded === null);
        const lines: string[] = [];

        if (managed.length === 0) {
            lines.push('No campaigns are managed yet: the first weekly run decides which ones are.');
        } else {
            lines.push('Campaigns that go live:');

            for (const item of managed.slice(0, PREVIEW_MAX_LINES)) {
                const budget = item.monthly_budget === null ? '' : `, ${item.monthly_budget}${item.currency === null ? '' : ` ${item.currency}`} a month`;
                lines.push(`  ${item.campaign_name ?? item.campaign_id}, ${item.country_or_region ?? 'no country'}${budget}`);
            }

            if (managed.length > PREVIEW_MAX_LINES) {
                lines.push(`  and ${managed.length - PREVIEW_MAX_LINES} more`);
            }
        }

        lines.push(LIVE_WARNING);
        process.stderr.write(`${lines.join('\n')}\n`);
    }

    private summaryFor(body: { dry_run: boolean; enabled: boolean }, wasEnabled: boolean): string {
        if (!body.enabled && !wasEnabled) {
            return `Set the stored mode to ${body.dry_run ? 'dry_run' : 'live'}: the budget autopilot stays off and writes nothing to Apple Ads`;
        }

        if (!body.enabled) {
            return 'Turn the budget autopilot off: budgets stay as they are and campaigns it paused stay paused';
        }

        return body.dry_run
            ? 'Run the budget autopilot in dry run: it plans changes and writes nothing to Apple Ads'
            : 'Run the budget autopilot in Live: it writes budget changes and campaign pauses to Apple Ads';
    }
}
