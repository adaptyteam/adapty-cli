import { AdaptyCommand, metricsCsvFlag, placementIdsFlag, placementTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { metricsRowsCsv, renderMetricsRows } from '../../../views/metrics.js';

import type { PlacementMetricsRows } from '../../../../sdk/adapty/index.js';

export default class PlacementsMetricsList extends AdaptyCommand {
    static override description = 'Show the lifetime metrics of several flow placements or several paywall placements, one row for each (the dashboard placements table)';

    static override examples = [
        '<%= config.bin %> placements metrics list --app APP_UUID --type flow --ids PLACEMENT_UUID,PLACEMENT_UUID',
        '<%= config.bin %> placements metrics list --app APP_UUID --type flow --ids PLACEMENT_UUID --csv',
        '<%= config.bin %> placements metrics list --app APP_UUID --type paywall --ids PLACEMENT_UUID,PLACEMENT_UUID',
    ];

    static override flags = {
        ...appIdFlag,
        ...placementTypeFlag,
        ...placementIdsFlag,
        ...metricsCsvFlag,
    };

    async run(): Promise<PlacementMetricsRows> {
        const { flags } = await this.parse(PlacementsMetricsList);
        const rows = await this.adapty.placements.metrics.list(flags.app, flags.type, flags.ids);
        const view = flags.csv ? metricsRowsCsv : renderMetricsRows;

        this.render(rows, value => view(value, 'placement_id'));

        return rows;
    }
}
