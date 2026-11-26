import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { feedPageFlags, feedPageParams, feedWindowFlags, logNextOffset, resolveFeedWindow } from '../../../lib/asa-flags.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaKeywordAutopilotDecisionDTO, AsaKeywordAutopilotDecisionFeedDTO } from '../../../lib/asa-schemas.js';

export default class AsaKeywordAutopilotDecisions extends Command {
    static override description
        = 'Show the keyword autopilot decisions the client sees (bid changes, pauses, alerts), newest first, for a time window';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keyword-autopilot decisions',
        '<%= config.bin %> asa keyword-autopilot decisions --date-from 2026-09-01 --date-to 2026-09-07 --severity alert',
        '<%= config.bin %> asa keyword-autopilot decisions --keyword UUID --limit 20',
    ];

    static override flags = {
        ...feedWindowFlags,
        keyword: Flags.string({
            description: 'Keep only decisions of this keyword (UUID, the ID printed by asa keyword-autopilot list)',
        }),
        ...feedPageFlags(100, 500),
        severity: Flags.string({
            description: 'Keep only this severity; repeatable (the feed holds action and alert decisions only)',
            multiple: true,
            options: ['action', 'alert'],
        }),
    };

    async run(): Promise<AsaKeywordAutopilotDecisionFeedDTO> {
        const { flags } = await this.parse(AsaKeywordAutopilotDecisions);

        if (flags.keyword !== undefined && !isValidUuid(flags.keyword)) {
            this.error('Invalid keyword ID format. Run `adapty asa keyword-autopilot list` to find it.', { exit: 2 });
        }

        let window: { date_from: string; date_to: string };

        try {
            window = resolveFeedWindow(flags, new Date());
        } catch (error) {
            this.error((error as Error).message, { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaKeywordAutopilotDecisionFeedDTO>('/keyword-autopilot/decisions', {
            ...window,
            keyword_id: flags.keyword,
            ...feedPageParams(flags),
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

    private printDecision(decision: AsaKeywordAutopilotDecisionDTO, log: (msg: string) => void): void {
        log(`${decision.occurred_at}  keyword ${decision.keyword_id}`);
        log(`Severity: ${decision.severity}`);
        log(`Kind: ${decision.kind}`);
        log(`Title: ${decision.text.title}`);
        log(`Saw: ${decision.text.saw}`);
        log(`Why: ${decision.text.why}`);
        log(`Decision: ${decision.text.decision}`);

        if (decision.bid_from !== null || decision.bid_to !== null) {
            log(`Bid: ${decision.bid_from ?? '-'} -> ${decision.bid_to ?? '-'}`);
        }

        if (decision.status_from !== null || decision.status_to !== null) {
            log(`Status: ${decision.status_from ?? '-'} -> ${decision.status_to ?? '-'}`);
        }
    }
}
