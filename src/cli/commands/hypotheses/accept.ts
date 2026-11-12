import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { acceptFlags, hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { AcceptHypothesisInput, Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesAccept extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };

    static override description = 'Accept a proposed hypothesis into the backlog. An audience hypothesis needs --placement-audience; '
        + 'a flow hypothesis already shipped without an A/B test takes --placement-audience with --variant-flow and is applied, never linked to a test; '
        + 'every product row needs a product, from the hypothesis or --product';

    static override examples = [
        '<%= config.bin %> hypotheses accept --app UUID HYPOTHESIS_ID',
        '<%= config.bin %> hypotheses accept --app UUID HYPOTHESIS_ID --variant-flow UUID',
        '<%= config.bin %> hypotheses accept --app UUID HYPOTHESIS_ID --variant-flow UUID --placement-audience UUID',
        '<%= config.bin %> hypotheses accept --app UUID HYPOTHESIS_ID --product HYPOTHESIS_PRODUCT_ID=PRODUCT_ID',
    ];

    static override flags = { ...appIdFlag, ...acceptFlags };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesAccept);

        const input: AcceptHypothesisInput = {
            placementAudienceId: flags['placement-audience'],
            products: flags.product,
            variantFlowId: flags['variant-flow'],
        };

        const hypothesis = await this.adapty.hypotheses.accept(flags.app, args.hypothesis_id, input);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
