import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { dismissFlags, hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesDismiss extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Dismiss a hypothesis; an A/B test linked to it that never started is unlinked. '
        + '--reason says why and is shown until restore brings it back as proposed';

    static override examples = [
        '<%= config.bin %> hypotheses dismiss --app UUID HYPOTHESIS_ID',
        '<%= config.bin %> hypotheses dismiss --app UUID HYPOTHESIS_ID --reason "Shipped with the new pricing instead"',
    ];

    static override flags = { ...appIdFlag, ...dismissFlags };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesDismiss);
        const hypothesis = await this.adapty.hypotheses.dismiss(flags.app, args.hypothesis_id, flags.reason);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
