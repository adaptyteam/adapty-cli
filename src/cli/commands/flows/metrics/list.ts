import { AdaptyCommand, metricsCsvFlag, flowIdsFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { neverPublishedLines } from '../../../views/flow-versions.js';
import { metricsRowsCsv, renderMetricsRows } from '../../../views/metrics.js';

import type { FlowMetricsRow } from '../../../../sdk/adapty/index.js';

/** The rows as the server gives them; `note` on the row of a flow that was never published. */
export type FlowMetricsListAnswer = { data: (FlowMetricsRow & { note?: 'never_published' })[] };

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

    async run(): Promise<FlowMetricsListAnswer> {
        const { flags } = await this.parse(FlowsMetricsList);

        // The flows are read at once with the metrics; a flow that cannot be read gives its row no note
        const [rows, unpublished] = await Promise.all([
            this.adapty.flows.metrics.list(flags.app, flags.ids),
            this.adapty.flows.neverPublished(flags.app, flags.ids),
        ]);

        const answer: FlowMetricsListAnswer = {
            ...rows,
            data: rows.data.map(row => (unpublished.has(row.flow_id) ? { ...row, note: 'never_published' } : row)),
        };

        const noted = answer.data.filter(row => row.note !== undefined).map(row => row.flow_id);

        if (flags.csv) {
            // The notes go to stderr: stdout stays a CSV
            if (noted.length > 0 && !this.jsonEnabled()) {
                this.logToStderr(neverPublishedLines(noted).join('\n'));
            }

            this.render(answer, value => metricsRowsCsv(value, 'flow_id'));
        } else {
            this.render(answer, value => [renderMetricsRows(value, 'flow_id'), ...neverPublishedLines(noted)].join('\n'));
        }

        return answer;
    }
}
