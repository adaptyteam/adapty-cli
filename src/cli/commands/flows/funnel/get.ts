import { Flags } from '@oclif/core';

import { AdaptyCommand, filterFlags, flowIdArg, parseExactFilter, periodFlags, requiredDateTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { uuidParser } from '../../../input/uuid.js';
import { renderFlowFunnel } from '../../../views/flow-funnel.js';

import type { AnalyticsFilter, FlowFunnelAnswer } from '../../../../sdk/adapty/index.js';

export default class FlowsFunnelGet extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'Show on which screen the users of a flow leave it: the funnel of one flow version, '
        + 'step by step and screen by screen (the Funnel tab of the dashboard)';

    static override examples = [
        '<%= config.bin %> flows funnel get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
        '<%= config.bin %> flows funnel get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type profile_install_date --filter platform=iOS --flow-version-id VERSION_UUID',
        '<%= config.bin %> flows funnel get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --csv > funnel.csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...periodFlags,
        ...requiredDateTypeFlag,
        'csv': Flags.boolean({
            description: 'Print the CSV that the dashboard downloads, as the server writes it (the total row first); '
                + 'the CLI does not build it',
            exclusive: ['json'],
        }),
        'filter': Flags.custom<AnalyticsFilter>({
            description: 'Keep the users with these values of a filter key: key=value[,value], as `flows funnel values` lists them '
                + '(repeatable; `\\,` for a comma inside a value; values exactly as written)',
            multiple: true,
            parse: parseExactFilter,
        })(),
        'flow-version-id': Flags.string({
            description: 'Flow version ID (UUID) to read; the published version when omitted',
            parse: uuidParser('Invalid flow version ID format.'),
        }),
        'timezone': filterFlags.timezone,
    };

    async run(): Promise<FlowFunnelAnswer | string> {
        const { args, flags } = await this.parse(FlowsFunnelGet);

        const input = {
            dateFrom: flags['date-from'],
            dateTo: flags['date-to'],
            dateType: flags['date-type'],
            filters: flags.filter,
            flowVersionId: flags['flow-version-id'],
            timezone: flags.timezone,
        };

        if (flags.csv) {
            const csv = await this.adapty.flows.funnel.csv(flags.app, args.flow_id, input);

            // log() ends the text with a newline; the server's CSV may already have one
            this.render(csv, text => (text.endsWith('\n') ? text.slice(0, -1) : text));

            return csv;
        }

        const answer = await this.adapty.flows.funnel.get(flags.app, args.flow_id, input);

        this.render(answer, value => renderFlowFunnel(value, {
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            dateType: input.dateType,
            versionGiven: input.flowVersionId !== undefined,
        }));

        return answer;
    }
}
