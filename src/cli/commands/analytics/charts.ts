import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../flags.js';

import type { CatalogChart, CatalogResponse } from '../../../sdk/adapty/index.js';

/** Traits under their catalog field names, so a reader knows what to look for in --json. */
const describeChart = (chart: CatalogChart): string => {
    const traits = [chart.unit, chart.revenue_basis ? 'revenue_basis' : undefined].filter(trait => trait !== undefined);
    const title = traits.length === 0 ? chart.title : `${chart.title} (${traits.join(', ')})`;

    return [
        `${chart.chart_id}: ${title}`,
        `  segmentations: ${chart.segmentations.join(', ') || 'none'}`,
        `  filters: ${chart.filters.join(', ') || 'none'}`,
    ].join('\n');
};

const renderCharts = ({ data }: CatalogResponse): string => [
    ...data.charts.map(chart => describeChart(chart)),
    '',
    `Granularities: ${data.period_units.join(', ')}`,
    `Revenue bases: ${data.revenue_bases.join(', ')}`,
].join('\n');

export default class AnalyticsCharts extends AdaptyCommand {
    static override description = 'List the charts `analytics chart` reads, with the dimensions each one can be segmented and filtered by';

    static override examples = [
        '<%= config.bin %> analytics charts --app APP_UUID',
        '<%= config.bin %> analytics charts --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<CatalogResponse> {
        const { flags } = await this.parse(AnalyticsCharts);

        const catalog = await this.adapty.analytics.catalog(flags.app);

        this.render(catalog, renderCharts);

        return catalog;
    }
}
