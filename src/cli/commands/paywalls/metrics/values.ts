import { AdaptyCommand, paywallIdArg } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderFilterValues } from '../../../views/metrics.js';

import type { FilterValues } from '../../../../sdk/adapty/index.js';

export default class PaywallsMetricsValues extends AdaptyCommand {
    static override args = { ...paywallIdArg };
    static override description = 'List the filter values of a paywall: the keys and values that `paywalls metrics get --filter key=value` takes';

    static override examples = [
        '<%= config.bin %> paywalls metrics values PAYWALL_UUID --app APP_UUID',
        '<%= config.bin %> paywalls metrics values PAYWALL_UUID --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<FilterValues> {
        const { args, flags } = await this.parse(PaywallsMetricsValues);
        const values = await this.adapty.paywalls.metrics.values(flags.app, args.paywall_id);

        this.render(values, renderFilterValues);

        return values;
    }
}
