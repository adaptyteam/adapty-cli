import { validateStart } from '../../../sdk/adapty/ab-tests/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, requiredPlacementFlag, runningAudienceFlags, runningSegmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { startEffect } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail, StartAbTestInput } from '../../../sdk/adapty/index.js';

export default class AbTestsStart extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Start an A/B test on a placement for one audience; it cannot be undone, so it asks first';

    static override examples = [
        '<%= config.bin %> ab-tests start --app UUID TEST_ID --placement UUID --segment UUID',
        '<%= config.bin %> ab-tests start --app UUID TEST_ID --placement UUID --all-users --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...requiredPlacementFlag('Placement to run the test on (ID)'),
        ...runningAudienceFlags,
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsStart);
        const input: StartAbTestInput = { placementId: flags.placement, segmentIds: runningSegmentIds(flags) };

        assertValid(validateStart(input));

        // One read for the title and the state, then the question, then the write
        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: startEffect(test, input),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const started = await this.adapty.abTests.start(flags.app, args.ab_test_id, input);

        this.render(started, renderAbTest);

        return started;
    }
}
