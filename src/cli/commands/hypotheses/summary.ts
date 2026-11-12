import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderHypothesisSummaryTable } from '../../views/hypotheses.js';

import type { HypothesisSummary } from '../../../sdk/adapty/index.js';

export default class HypothesesSummary extends AdaptyCommand {
    static override description = 'Count the open hypotheses (proposed and accepted) per placement, by phase; an applied audience change has no phase column';
    static override examples = ['<%= config.bin %> hypotheses summary --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<HypothesisSummary> {
        const { flags } = await this.parse(HypothesesSummary);
        const summary = await this.adapty.hypotheses.summary(flags.app);

        this.render(summary, renderHypothesisSummaryTable);

        return summary;
    }
}
