import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesRestore extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Bring a dismissed hypothesis back as proposed, on top of its placement backlog';
    static override examples = ['<%= config.bin %> hypotheses restore --app UUID HYPOTHESIS_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesRestore);
        const hypothesis = await this.adapty.hypotheses.act(flags.app, args.hypothesis_id, 'restore');

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
