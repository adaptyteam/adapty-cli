import { Flags } from '@oclif/core';

import { validateValues } from '../../../sdk/attribution/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AttributionCommand } from '../../base/attribution/index.js';
import { appFlag, periodFlags, periodParams, revenueBasisFlag } from '../../flags.js';

import type { ValuesData, ValuesInput, ValuesResponse } from '../../../sdk/attribution/index.js';

const describeItem = (item: ValuesData['items'][number]): string => {
    if ('value' in item) {
        return item.value;
    }

    return `${item.name ?? '—'} (${item.channel}, id ${item.id ?? '—'})`;
};

const renderValues = ({ data }: ValuesResponse): string => (data.items.length === 0
    ? `No ${data.dimension} values for this period.`
    : data.items.map(item => describeItem(item)).join('\n'));

export default class AttributionValues extends AttributionCommand {
    static override description = 'List the values a dimension takes for an app over a period: what a report --filter can use';

    static override examples = [
        '<%= config.bin %> attribution values --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --dimension campaign',
    ];

    static override flags = {
        ...appFlag,
        ...periodFlags,
        dimension: Flags.string({
            description: 'A filterable dimension, as `adapty attribution dimensions` lists it',
            required: true,
        }),
        ...revenueBasisFlag,
    };

    async run(): Promise<ValuesResponse> {
        const { flags } = await this.parse(AttributionValues);

        const input: ValuesInput = {
            appId: flags.app,
            ...periodParams(flags),
            dimension: flags.dimension,
            revenueBasis: flags['revenue-basis'],
        };

        // Before this.attribution: bad input is exit 2 even without a token
        assertValid(validateValues(input));

        const values = await this.attribution.values(input);

        this.render(values, renderValues);

        return values;
    }
}
