import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { hypothesisIdArg, resultFlag } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesReresolve extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Replace the verdict an A/B test gave a hypothesis with your own; it is final, so it asks first';
    static override examples = [
        '<%= config.bin %> hypotheses reresolve --app UUID HYPOTHESIS_ID --result won',
        '<%= config.bin %> hypotheses reresolve --app UUID HYPOTHESIS_ID --result lost --yes',
    ];

    static override flags = { ...appIdFlag, ...resultFlag, ...yesFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesReresolve);

        // The token is checked before the question, so nobody answers y only to read an auth error
        const { adapty } = this;

        await confirmAction({
            effect: `Replace the verdict the A/B test gave hypothesis ${args.hypothesis_id} with ${flags.result}. A verdict you give is final: no command changes it.`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const hypothesis = await adapty.hypotheses.reresolve(flags.app, args.hypothesis_id, flags.result);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
