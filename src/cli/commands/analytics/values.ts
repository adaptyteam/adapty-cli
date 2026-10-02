import { Args } from '@oclif/core';

import { validateValues } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../flags.js';

import type { DimensionValue, ValuesResponse } from '../../../sdk/adapty/index.js';

/** The value first: it is what `--filter` takes; the label and group only explain it. */
const describeValue = (item: DimensionValue): string => {
    const label = item.label === item.value ? '' : ` ${item.label}`;
    const group = item.group === undefined ? '' : ` (${item.group})`;

    return `${item.value}${label}${group}`;
};

export default class AnalyticsValues extends AdaptyCommand {
    static override args = {
        dimension: Args.string({
            description: 'A filter dimension, as `adapty analytics dimensions` lists it (e.g. country, store_product_id)',
            required: true,
        }),
    };

    static override description = 'List the values a dimension takes in an app: what `analytics chart --filter` can use';

    static override examples = [
        '<%= config.bin %> analytics values country --app APP_UUID',
        '<%= config.bin %> analytics values store_product_id --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<ValuesResponse> {
        const { args, flags } = await this.parse(AnalyticsValues);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateValues(args.dimension));

        const values = await this.adapty.analytics.values(flags.app, args.dimension);

        this.render(values, ({ data }) => (data.length === 0
            ? `No ${args.dimension} values in this app.`
            : data.map(item => describeValue(item)).join('\n')));

        return values;
    }
}
