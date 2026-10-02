import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../flags.js';

import type { CatalogDimension, CatalogResponse } from '../../../sdk/adapty/index.js';

const describeDimension = (dimension: CatalogDimension): string => {
    const uses = [dimension.filter ? 'filter' : undefined, dimension.segmentation ? 'segment' : undefined]
        .filter(use => use !== undefined);

    return `${dimension.key}: ${dimension.title} (${uses.join(', ') || 'no use'})`;
};

export default class AnalyticsDimensions extends AdaptyCommand {
    static override description = 'List the dimensions `analytics chart` can filter by (--filter) and segment by (--segment-by)';

    static override examples = [
        '<%= config.bin %> analytics dimensions --app APP_UUID',
        '<%= config.bin %> analytics dimensions --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<CatalogResponse> {
        const { flags } = await this.parse(AnalyticsDimensions);

        const catalog = await this.adapty.analytics.catalog(flags.app);

        this.render(catalog, ({ data }) => data.dimensions.map(dimension => describeDimension(dimension)).join('\n'));

        return catalog;
    }
}
