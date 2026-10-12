import { analyticsView, csvNotice } from '../../views/analytics/segments.js';

import { AdaptyCommand } from './adapty-command.js';

import type { AnalyticsAnswer } from '../../views/analytics/segments.js';

/**
 * `AdaptyCommand` plus the one way the six analytics data commands print an answer, so the output rules (the
 * human view, the CSV, the summary on stderr beside a CSV without data) live in one place.
 */
export abstract class AnalyticsCommand extends AdaptyCommand {
    /** The human view, or with `--csv` the CSV; when the asked period has no data, the summary goes to stderr. */
    protected renderAnswer(answer: AnalyticsAnswer, csv: boolean): void {
        this.render(answer, analyticsView(csv));

        const notice = csv ? csvNotice(answer) : undefined;

        if (notice !== undefined) {
            this.logToStderr(notice);
        }
    }
}
