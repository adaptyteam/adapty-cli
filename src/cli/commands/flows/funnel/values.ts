import { AdaptyCommand, flowIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderFilterValues } from '../../../views/metrics.js';

import type { FilterValues } from '../../../../sdk/adapty/index.js';

export default class FlowsFunnelValues extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'List the filter values of the funnel of a flow: the keys and values that `flows funnel get --filter key=value` takes';

    static override examples = [
        '<%= config.bin %> flows funnel values FLOW_UUID --app APP_UUID',
        '<%= config.bin %> flows funnel values FLOW_UUID --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<FilterValues> {
        const { args, flags } = await this.parse(FlowsFunnelValues);
        const values = await this.adapty.flows.funnel.values(flags.app, args.flow_id);

        this.render(values, renderFilterValues);

        return values;
    }
}
