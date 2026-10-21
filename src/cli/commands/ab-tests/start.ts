import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, requiredPlacementFlag, runningAudienceFlags, segmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { startEffect } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsStart extends AdaptyCommand {
    static override args = { ...abTestIdArg };

    static override description
        = 'Start an A/B test on a placement for one audience: All users or one segment. It changes what real users see '
            + 'and cannot be undone: it asks first, or refuses (exit 6) without --yes when nobody can answer';

    static override examples = [
        '<%= config.bin %> ab-tests start --app APP_UUID TEST_UUID --placement PLACEMENT_UUID --segment SEGMENT_UUID',
        '<%= config.bin %> ab-tests start --app APP_UUID TEST_UUID --placement PLACEMENT_UUID --all-users --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...requiredPlacementFlag('Placement to run the test on (ID)'),
        ...runningAudienceFlags,
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsStart);
        const target = { placementId: flags.placement, segmentIds: segmentIds(flags) ?? [] };

        // One read for the title and the state, then the question, then the write
        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: startEffect(test, target),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const started = await this.adapty.abTests.start(flags.app, args.ab_test_id, target);

        this.render(started, renderAbTest);

        return started;
    }
}
