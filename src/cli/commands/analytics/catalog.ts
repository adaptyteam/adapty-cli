import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';

import type {
    AnalyticsCatalog,
    CatalogChart,
    CatalogOperation,
    CatalogOption,
    CatalogResponse,
    CatalogSegmentation,
} from '../../../sdk/adapty/index.js';

const list = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.join(', '));

const keys = (segmentations: readonly CatalogSegmentation[]): string =>
    list(segmentations.map(segmentation => segmentation.key));

/** Under the catalog's own names, so a reader knows what to look for in --json and what a flag takes. */
const describeOption = (option: CatalogOption): string => {
    const values = option.values === null ? '' : ` ${option.values.join('|')}`;
    const fallback = option.default === null ? '' : ` (default ${String(option.default)})`;

    return `${option.name}${values}${fallback}`;
};

const describeOperation = (operation: CatalogOperation): string => {
    const perChart = operation.id === 'metrics' ? 'per chart, see Charts' : undefined;

    return [
        `${operation.id} (${operation.method} ${operation.path}; ${operation.can_compare ? 'can compare two periods' : 'one period only'})`,
        `  options: ${operation.options.map(option => describeOption(option)).join('; ')}`,
        `  groupings: ${perChart ?? keys(operation.segmentations)}`,
        `  filters: ${perChart ?? list(operation.filters)}`,
    ].join('\n');
};

const describeChart = (chart: CatalogChart): string => [
    `${chart.id}: ${chart.title} (${chart.unit}${chart.takes_revenue_basis ? ', takes revenue_basis' : ''})`,
    `  groupings: ${keys(chart.segmentations)}`,
    `  filters: ${list(chart.filters)}`,
].join('\n');

const renderCatalog = ({ data }: { data: AnalyticsCatalog }): string => [
    'Operations',
    ...data.operations.map(operation => describeOperation(operation)),
    '',
    'Charts',
    ...data.charts.map(chart => describeChart(chart)),
    '',
    'Conversions',
    ...data.conversions.map(conversion => `${conversion.id}: ${conversion.title}`),
    '',
    'Dimensions',
    ...data.dimensions.map(dimension => `${dimension.key}: ${dimension.label}`),
].join('\n');

export default class AnalyticsCatalogCommand extends AdaptyCommand {
    static override description = 'List what the analytics of an app can answer: the six operations with their options, '
        + 'groupings and filters, every chart and conversion, and every filter dimension';

    static override examples = [
        '<%= config.bin %> analytics catalog --app APP_UUID',
        '<%= config.bin %> analytics catalog --app APP_UUID --json',
    ];

    static override flags = { ...appIdFlag };

    async run(): Promise<CatalogResponse> {
        const { flags } = await this.parse(AnalyticsCatalogCommand);

        const catalog = await this.adapty.analytics.catalog(flags.app);

        this.render(catalog, renderCatalog);

        return catalog;
    }
}
