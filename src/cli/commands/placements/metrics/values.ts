import { AdaptyCommand, placementIdArg, placementTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderFilterValues } from '../../../views/metrics.js';

import type { FilterValues } from '../../../../sdk/adapty/index.js';

export default class PlacementsMetricsValues extends AdaptyCommand {
    static override args = { ...placementIdArg };
    static override description = 'List the filter values of a flow placement: the keys and values that `placements metrics get --filter key=value` takes';

    static override examples = [
        '<%= config.bin %> placements metrics values PLACEMENT_UUID --app APP_UUID --type flow',
        '<%= config.bin %> placements metrics values PLACEMENT_UUID --app APP_UUID --type flow --json',
    ];

    static override flags = {
        ...appIdFlag,
        ...placementTypeFlag,
    };

    async run(): Promise<FilterValues> {
        const { args, flags } = await this.parse(PlacementsMetricsValues);
        const values = await this.adapty.placements.metrics.values(flags.app, args.placement_id, flags.type);

        this.render(values, renderFilterValues);

        return values;
    }
}
