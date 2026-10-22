import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderFilterValues } from '../../../views/metrics.js';

import type { FilterValues } from '../../../../sdk/adapty/index.js';

export default class FlowsMetricsValues extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'List the filter values of a flow: the keys and values that `flows metrics get --filter key=value` takes';

    static override examples = [
        '<%= config.bin %> flows metrics values FLOW_UUID --app APP_UUID',
        '<%= config.bin %> flows metrics values FLOW_UUID --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<FilterValues> {
        const { args, flags } = await this.parse(FlowsMetricsValues);
        const values = await this.adapty.flows.metrics.values(flags.app, args.flow_id);

        this.render(values, renderFilterValues);

        return values;
    }
}
