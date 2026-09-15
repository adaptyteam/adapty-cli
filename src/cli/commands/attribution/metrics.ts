import { AttributionCommand } from '../../base/attribution/index.js';

import type { Metric, MetricsResponse } from '../../../sdk/attribution/index.js';

const describeMetric = (metric: Metric): string => {
    const pattern = metric.pattern === null
        ? ''
        : ` — pattern ${metric.pattern}${metric.example === null ? '' : `, e.g. ${metric.example}`}`;

    return `${metric.name} (${metric.unit})${pattern}\n  ${metric.label}: ${metric.description}`;
};

export default class AttributionMetrics extends AttributionCommand {
    static override description = 'List the metrics an attribution report can ask for (not scoped to an app)';
    static override examples = ['<%= config.bin %> attribution metrics', '<%= config.bin %> attribution metrics --json'];

    async run(): Promise<MetricsResponse> {
        await this.parse(AttributionMetrics);

        const catalog = await this.attribution.metrics();

        this.render(catalog, ({ data }) => data.metrics.map(metric => describeMetric(metric)).join('\n'));

        return catalog;
    }
}
