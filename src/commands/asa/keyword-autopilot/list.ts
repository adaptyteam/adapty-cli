import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { printList } from '../../../lib/output.js';

import type { AsaKeywordAutopilotKeywordDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

const STATUSES = ['dormant', 'human_review', 'learning', 'paused', 'provisional', 'ramp', 'working'];

const PAUSED_CODES = [
    'degraded',
    'funnel_install_to_trial',
    'funnel_tap_to_install',
    'funnel_trial_to_paid',
    'no_auction',
    'no_download',
    'no_volume',
    'spend_guard_no_trials',
    'trials_dont_convert',
    'weak_proxies',
];

export default class AsaKeywordAutopilotList extends Command {
    static override description
        = 'List the keywords enrolled in the keyword autopilot; the ID in each row is the one the other keyword-autopilot commands take';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keyword-autopilot list',
        '<%= config.bin %> asa keyword-autopilot list --status paused --paused-code no_volume',
        '<%= config.bin %> asa keyword-autopilot list --enabled --page-size 200',
    ];

    static override flags = {
        'enabled': Flags.boolean({
            allowNo: true,
            description: '--enabled keeps the keywords the autopilot manages, --no-enabled the ones it does not manage (unenrolled, awaiting activation, or paused by you in Apple Ads); omit for both',
        }),
        'page': Flags.integer({ default: 1, description: 'Page number', min: 1 }),
        'page-size': Flags.integer({ default: 50, description: 'Items per page (max 200)', max: 200, min: 1 }),
        'paused-code': Flags.string({
            description: 'Keep only keywords paused for this reason; repeatable',
            multiple: true,
            options: PAUSED_CODES,
        }),
        'status': Flags.string({
            description: 'Keep only keywords in this autopilot status; repeatable',
            multiple: true,
            options: STATUSES,
        }),
    };

    async run(): Promise<PaginatedResponse<AsaKeywordAutopilotKeywordDTO>> {
        const { flags } = await this.parse(AsaKeywordAutopilotList);

        // An allowNo boolean without a default stays undefined when unset, though oclif types it boolean
        const enabled = flags.enabled as boolean | undefined;
        const client = await createAsaClient(this);

        const result = await client.get<PaginatedResponse<AsaKeywordAutopilotKeywordDTO>>('/keyword-autopilot/keywords', {
            enabled: enabled === undefined ? undefined : String(enabled),
            page: String(flags.page),
            page_size: String(flags['page-size']),
            paused_code: flags['paused-code'],
            status: flags.status,
        });

        if (result.data.length === 0) {
            const filtered = enabled !== undefined || flags['paused-code'] !== undefined || flags.status !== undefined;

            if (flags.page > 1) {
                this.log('No more rows.');
            } else {
                this.log(filtered ? 'No keywords match these filters.' : 'No keywords are on the keyword autopilot yet.');
            }

            return result;
        }

        printList(
            result.data.map(item => ({ ...item, last_decision: this.describeLastDecision(item) })),
            this.log.bind(this),
            result.meta.pagination,
        );

        return result;
    }

    private describeLastDecision(item: AsaKeywordAutopilotKeywordDTO): string | undefined {
        return item.last_decision ? `${item.last_decision.text.title} (${item.last_decision.occurred_at})` : undefined;
    }
}
