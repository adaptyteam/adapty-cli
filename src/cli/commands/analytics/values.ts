import { Flags } from '@oclif/core';

import { validateFilterValues } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';

import type { FilterValue, FilterValuesInput, FilterValuesResponse } from '../../../sdk/adapty/index.js';

/** The value first, as `--filter <dimension>=<value>` takes it; an empty value is shown as `""`. */
const describeValue = (item: FilterValue): string =>
    `${item.value === '' ? '""' : item.value}: ${item.label}${item.group === null ? '' : ` (${item.group})`}`;

const renderValues = ({ data, meta }: FilterValuesResponse): string => (data.length === 0
    ? `No ${meta.dimension} values for this app.`
    : data.map(item => describeValue(item)).join('\n'));

export default class AnalyticsValues extends AdaptyCommand {
    static override description = 'List the values one analytics filter takes for an app: what --filter accepts';

    static override examples = [
        '<%= config.bin %> analytics values --app APP_UUID --dimension country',
        '<%= config.bin %> analytics values --app APP_UUID --dimension store_product_id --json',
    ];

    static override flags = {
        ...appIdFlag,
        dimension: Flags.string({
            description: 'A filter dimension, as `adapty analytics catalog` lists it under Dimensions',
            required: true,
        }),
    };

    async run(): Promise<FilterValuesResponse> {
        const { flags } = await this.parse(AnalyticsValues);

        const input: FilterValuesInput = { appId: flags.app, dimension: flags.dimension };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateFilterValues(input));

        const values = await this.adapty.analytics.values(input);

        this.render(values, renderValues);

        return values;
    }
}
