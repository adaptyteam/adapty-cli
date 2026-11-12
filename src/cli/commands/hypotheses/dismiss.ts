import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesDismiss extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Dismiss a hypothesis; an A/B test linked to it that never started is unlinked. Undo with restore';
    static override examples = ['<%= config.bin %> hypotheses dismiss --app UUID HYPOTHESIS_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesDismiss);
        const hypothesis = await this.adapty.hypotheses.act(flags.app, args.hypothesis_id, 'dismiss');

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
