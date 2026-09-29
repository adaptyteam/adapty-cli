import { AttributionCommand } from '../../base/attribution/index.js';

import type { Metric, MetricsResponse, ReportLimits } from '../../../sdk/attribution/index.js';

/** Traits under their catalog field names, so a reader knows what to look for in --json. */
const describeMetric = (metric: Metric): string => {
    const traits = [
        metric.unit,
        metric.spend_based ? 'spend_based' : undefined,
        metric.denominator === null ? undefined : `denominator ${metric.denominator.join(' + ')}`,
    ].filter(trait => trait !== undefined);

    const pattern = metric.pattern === null
        ? ''
        : ` — pattern ${metric.pattern}${metric.example === null ? '' : `, e.g. ${metric.example}`}`;

    return `${metric.name} (${traits.join(', ')})${pattern}\n  ${metric.label}: ${metric.description}`;
};

const describeLimits = (limits: ReportLimits): string => {
    const windows = Object.entries(limits.max_window_days)
        .map(([grouping, days]) => `${grouping.replaceAll('_', ' ')} ${days}`)
        .join(', ');

    return [
        `Limits: ${limits.max_metrics} metrics, ${limits.max_filter_values} values per filter, `
        + `${limits.max_keyword_length} characters per keyword, ${limits.max_rows} rows`,
        `  Widest period in days: ${windows}`,
        `  Predictions: ${limits.max_prediction_horizons} horizons, day ${limits.max_prediction_day} at most, `
        + `${limits.max_prediction_non_date_dimensions} dimensions besides date`,
    ].join('\n');
};

export default class AttributionMetrics extends AttributionCommand {
    static override description = 'List the metrics an attribution report can ask for (not scoped to an app)';
    static override examples = ['<%= config.bin %> attribution metrics', '<%= config.bin %> attribution metrics --json'];

    async run(): Promise<MetricsResponse> {
        await this.parse(AttributionMetrics);

        const catalog = await this.attribution.metrics();

        this.render(catalog, ({ data }) =>
            [...data.metrics.map(metric => describeMetric(metric)), '', describeLimits(data.limits)].join('\n'));

        return catalog;
    }
}
