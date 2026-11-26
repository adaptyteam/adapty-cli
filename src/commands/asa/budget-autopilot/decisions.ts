import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { feedPageFlags, feedPageParams, feedWindowFlags, logNextOffset, resolveFeedWindow } from '../../../lib/asa-flags.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaBudgetAutopilotDecisionDTO, AsaBudgetAutopilotDecisionFeedDTO } from '../../../lib/asa-schemas.js';

const DECISION_KINDS = [
    'campaign_excluded',
    'campaign_included',
    'excluded_external_change',
    'shrink_dialog',
    'shrink_exit',
    'shrink_step',
    'skipped_ab_test',
    'skipped_budget_changed',
    'skipped_c_revised',
    'skipped_data_stale',
    'skipped_invalid_state',
    'skipped_locked',
    'skipped_metadata_stale',
    'skipped_multi_country',
    'skipped_no_data',
    'skipped_no_economics',
    'skipped_unsupported_type',
    'spend_guard_triggered',
    'test_batch',
    'test_giveback',
    'transfer',
    'transfer_blocked',
];

const EXECUTION_STATUSES = ['applied', 'dry_run', 'failed', 'observation', 'planned', 'retry_wait', 'sending'];
const SEVERITIES = ['critical', 'notable', 'routine'];

export default class AsaBudgetAutopilotDecisions extends Command {
    static override description
        = 'Show the budget autopilot decisions (budget transfers, skips, spend guard pauses), newest first, for a time window';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa budget-autopilot decisions',
        '<%= config.bin %> asa budget-autopilot decisions --date-from 2026-09-01 --severity critical --execution-status failed',
        '<%= config.bin %> asa budget-autopilot decisions --campaign UUID --decision-kind transfer',
    ];

    static override flags = {
        ...feedWindowFlags,
        ...feedPageFlags(20, 200),
        'adam-id': Flags.integer({ description: 'Keep only decisions of this Apple App Store ID (adam_id), from `asa apps list`' }),
        'campaign': Flags.string({ description: 'Keep only decisions of this campaign (UUID, the internal_id from asa campaigns list)' }),
        'campaign-group': Flags.string({ description: 'Keep only decisions of this organization (UUID from asa orgs list)' }),
        'decision-kind': Flags.string({
            description: 'Keep only this kind of decision; repeatable',
            multiple: true,
            options: DECISION_KINDS,
        }),
        'execution-status': Flags.string({
            description: 'Keep only decisions in this execution state; repeatable',
            multiple: true,
            options: EXECUTION_STATUSES,
        }),
        'severity': Flags.string({
            description: 'Keep only this severity; repeatable',
            multiple: true,
            options: SEVERITIES,
        }),
    };

    async run(): Promise<AsaBudgetAutopilotDecisionFeedDTO> {
        const { flags } = await this.parse(AsaBudgetAutopilotDecisions);

        if (flags.campaign !== undefined && !isValidUuid(flags.campaign)) {
            this.error('Invalid campaign ID format. Run `adapty asa campaigns list` to find it.', { exit: 2 });
        }

        if (flags['campaign-group'] !== undefined && !isValidUuid(flags['campaign-group'])) {
            this.error('Invalid campaign group ID format. Run `adapty asa orgs list` to find it.', { exit: 2 });
        }

        let window: { date_from: string; date_to: string };

        try {
            window = resolveFeedWindow(flags, new Date());
        } catch (error) {
            this.error((error as Error).message, { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaBudgetAutopilotDecisionFeedDTO>('/budget-autopilot/decisions', {
            ...window,
            ...feedPageParams(flags),
            adam_id: flags['adam-id'] === undefined ? undefined : String(flags['adam-id']),
            campaign_group_id: flags['campaign-group'],
            campaign_id: flags.campaign,
            decision_kind: flags['decision-kind'],
            execution_status: flags['execution-status'],
            severity: flags.severity,
        });

        const log = this.log.bind(this);

        for (const [i, decision] of result.items.entries()) {
            if (i > 0) {
                log('---');
            }

            this.printDecision(decision, log);
        }

        logNextOffset(result, log, flags['date-to'] === undefined ? window.date_to : undefined);

        return result;
    }

    private printDecision(decision: AsaBudgetAutopilotDecisionDTO, log: (msg: string) => void): void {
        log(`${decision.created_at}  ${decision.decision_kind}`);
        log(`Severity: ${decision.severity}`);
        log(`Mode: ${decision.mode}`);
        log(`Execution status: ${decision.execution_status}`);

        if (decision.campaign) {
            log(`Campaign: ${decision.campaign.campaign_name ?? decision.campaign.campaign_id}`);
        }

        if (decision.receiver_campaign) {
            log(`Receiver campaign: ${decision.receiver_campaign.campaign_name ?? decision.receiver_campaign.campaign_id}`);
        }

        log(`Title: ${decision.text.title}`);
        log(`Saw: ${decision.text.saw}`);
        log(`Why: ${decision.text.why}`);
        log(`Decision: ${decision.text.decision}`);

        const change = decision.budget_change;

        if (change) {
            const unit = change.currency === null ? '' : ` ${change.currency}`;

            if (change.campaign_monthly_from !== null || change.campaign_monthly_to !== null) {
                log(`Monthly budget: ${change.campaign_monthly_from ?? '-'} -> ${change.campaign_monthly_to ?? '-'}${unit}`);
            }

            if (change.receiver_monthly_from !== null || change.receiver_monthly_to !== null) {
                log(`Receiver monthly budget: ${change.receiver_monthly_from ?? '-'} -> ${change.receiver_monthly_to ?? '-'}${unit}`);
            }
        }

        log(`Needs attention: ${decision.needs_attention}`);
    }
}
