import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesUnaccept extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Move an accepted hypothesis back to proposed, dropping its variant and its A/B test link';
    static override examples = ['<%= config.bin %> hypotheses unaccept --app UUID HYPOTHESIS_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesUnaccept);
        const hypothesis = await this.adapty.hypotheses.act(flags.app, args.hypothesis_id, 'unaccept');

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
