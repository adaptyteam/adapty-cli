import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderHypothesisSummaryTable } from '../../views/hypotheses.js';

import type { HypothesisSummary } from '../../../sdk/adapty/index.js';

export default class HypothesesSummary extends AdaptyCommand {
    static override description = 'Count the open hypotheses (proposed and accepted) per placement, by phase. '
        + 'Placements are shown by ID: `adapty placements list --app <app>` names them.\n\n'
        + 'Proposed: waiting to be accepted or dismissed.\n'
        + 'Accepted, Test draft, Testing, Ended: the accepted ones by the state of their A/B test; '
        + 'a change applied without a test has no column.\n'
        + 'Need attention: an A/B test still in draft, a product the store rejected or wants action on, '
        + 'or a suggested result to confirm.\n'
        + 'Legacy: about a paywall, from before flows; only dismiss and restore apply.\n'
        + 'Projected: of another placement, counted here because this placement serves their flow';

    static override examples = ['<%= config.bin %> hypotheses summary --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<HypothesisSummary> {
        const { flags } = await this.parse(HypothesesSummary);
        const summary = await this.adapty.hypotheses.summary(flags.app);

        this.render(summary, renderHypothesisSummaryTable);

        return summary;
    }
}
