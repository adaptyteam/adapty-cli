import { AdaptyCommand, metricsCsvFlag, flowIdsFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
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
        ...metricsCsvFlag,
    };

    async run(): Promise<FlowMetricsRows> {
        const { flags } = await this.parse(FlowsMetricsList);
        const rows = await this.adapty.flows.metrics.list(flags.app, flags.ids);
        const view = flags.csv ? metricsRowsCsv : renderMetricsRows;

        this.render(rows, value => view(value, 'flow_id'));

        return rows;
    }
}
