import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { abTestFlag, hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesLink extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };

    static override description = 'Link an accepted flow hypothesis to the A/B test that checks it; '
        + 'when the test stops with a winner, the hypothesis is resolved won or lost';

    static override examples = ['<%= config.bin %> hypotheses link --app UUID HYPOTHESIS_ID --ab-test UUID'];
    static override flags = { ...appIdFlag, ...abTestFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesLink);
        const hypothesis = await this.adapty.hypotheses.link(flags.app, args.hypothesis_id, flags['ab-test']);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
