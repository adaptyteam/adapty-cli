import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { assertCsvOrJson, csvFlag, flowIdsFlag, timezoneFlag } from '../../../input/metrics.js';
import { metricsRowsCsv, renderMetricsRows } from '../../../views/metrics.js';

import type { FlowMetricsRows } from '../../../../sdk/adapty/index.js';

export default class FlowsMetricsList extends AdaptyCommand {
    static override description = 'Show the lifetime metrics of several flows, one row for each (the dashboard flows table)';

    static override examples = [
        '<%= config.bin %> flows metrics list --app APP_UUID --ids FLOW_UUID,FLOW_UUID',
        '<%= config.bin %> flows metrics list --app APP_UUID --ids FLOW_UUID --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...flowIdsFlag,
        ...timezoneFlag,
        ...csvFlag,
    };

    async run(): Promise<FlowMetricsRows> {
        const { flags } = await this.parse(FlowsMetricsList);

        // Before this.adapty: bad input is exit 2 even without a token
        assertCsvOrJson(flags.csv, this.jsonEnabled());

        const rows = await this.adapty.entityMetrics.flows.list(flags.app, flags.ids, flags.timezone);

        const view = flags.csv ? metricsRowsCsv : renderMetricsRows;

        this.render(rows, value => view(value, 'flow_id'));

        return rows;
    }
}
