import { AttributionCommand } from '../../base/attribution/index.js';

import type { Dimension, DimensionsResponse } from '../../../sdk/attribution/index.js';

const describeDimension = (dimension: Dimension): string => {
    const uses = [dimension.groupable ? 'group' : undefined, dimension.filterable ? 'filter' : undefined]
        .filter(use => use !== undefined);

    const granularities = dimension.granularities === null ? '' : `; granularities ${dimension.granularities.join(', ')}`;

    // identity says what a filter takes: an entity id, or the value itself
    return `${dimension.name}: ${dimension.label} (${uses.join(', ') || 'no use'}; identity ${dimension.identity}${granularities})`;
};

export default class AttributionDimensions extends AttributionCommand {
    static override description = 'List the dimensions an attribution report can group or filter by (not scoped to an app)';
    static override examples = ['<%= config.bin %> attribution dimensions', '<%= config.bin %> attribution dimensions --json'];

    async run(): Promise<DimensionsResponse> {
        await this.parse(AttributionDimensions);

        const catalog = await this.attribution.dimensions();

        this.render(catalog, ({ data }) => data.dimensions.map(dimension => describeDimension(dimension)).join('\n'));

        return catalog;
    }
}
