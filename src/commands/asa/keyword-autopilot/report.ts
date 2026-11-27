import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isRealDay, parseDate, todayUtc } from '../../../lib/asa-flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaKeywordAutopilotReportDTO } from '../../../lib/asa-schemas.js';

const MAX_WINDOW_DAYS = 60;
const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export default class AsaKeywordAutopilotReport extends Command {
    static override description
        = 'Keyword autopilot report for a date window: per keyword the Apple text, status, tier and the outcome numbers. '
            + 'Heavy: 6 calls per minute, one report at a time per company, and the server cancels it after 50 seconds, '
            + 'so narrow the window when that happens. --json carries the full report with the daily rows';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keyword-autopilot report',
        '<%= config.bin %> asa keyword-autopilot report --date-from 2026-09-01 --date-to 2026-09-14 --json',
    ];

    static override flags = {
        'date-from': Flags.string({
            description: `First day of the window (YYYY-MM-DD, inclusive), defaults to ${DEFAULT_WINDOW_DAYS - 1} days before --date-to`,
            parse: parseDate,
        }),
        'date-to': Flags.string({
            description: 'Last day of the window (YYYY-MM-DD, inclusive), defaults to today (UTC); at most 60 days from --date-from',
            parse: parseDate,
        }),
    };

    async run(): Promise<AsaKeywordAutopilotReportDTO> {
        const { flags } = await this.parse(AsaKeywordAutopilotReport);

        for (const [name, value] of [['--date-from', flags['date-from']], ['--date-to', flags['date-to']]] as const) {
            if (value !== undefined && !isRealDay(value)) {
                this.error(`${name} is not a real calendar date.`, { exit: 2 });
            }
        }

        const dateTo = flags['date-to'] ?? todayUtc();

        const dateFrom = flags['date-from']
            ?? new Date(Date.parse(`${dateTo}T00:00:00Z`) - (DEFAULT_WINDOW_DAYS - 1) * MS_PER_DAY).toISOString().slice(0, 10);

        const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / MS_PER_DAY + 1;

        if (days < 1) {
            this.error('--date-from must not be later than --date-to.', { exit: 2 });
        }

        if (days > MAX_WINDOW_DAYS) {
            this.error(`The window is ${days} days; the report allows at most ${MAX_WINDOW_DAYS}.`, { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaKeywordAutopilotReportDTO>('/keyword-autopilot/report', {
            date_from: dateFrom,
            date_to: dateTo,
        });

        const log = this.log.bind(this);

        printResponse(result.company, log);

        for (const keyword of result.keywords) {
            log('---');

            printResponse(
                {
                    text: keyword.apple.text,
                    country: keyword.state.country,
                    status: keyword.state.status,
                    tier: keyword.state.tier,
                    paused_code: keyword.state.paused_code,
                    outcome: keyword.outcome,
                },
                log,
            );
        }

        return result;
    }
}
