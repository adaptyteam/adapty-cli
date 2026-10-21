import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, abTestWriteFlags, placementFlag, plannedAudienceFlags, segmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsUpdate extends AdaptyCommand {
    static override args = { ...abTestIdArg };

    static override description
        = 'Update an A/B test: the whole test is sent again. A draft changes every field. '
            + 'A test that started (live, completed, inactive, archived) changes only its title and goal, with no new draw: '
            + 'send the same arms and placement, or the server refuses';

    static override examples = [
        '<%= config.bin %> ab-tests update --app APP_UUID TEST_UUID --title "Price test (Q4)" --placement PLACEMENT_UUID --paywalls \'[{"paywall_id":"A","weight":70},{"paywall_id":"B","weight":30}]\'',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestWriteFlags,
        ...placementFlag('Placement the test is planned for (ID)'),
        ...plannedAudienceFlags,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsUpdate);

        const test = await this.adapty.abTests.update(flags.app, args.ab_test_id, {
            flows: flags.flows,
            goal: flags.goal,
            paywalls: flags.paywalls,
            placementId: flags.placement,
            segmentIds: segmentIds(flags),
            title: flags.title,
        });

        this.render(test, renderAbTest);

        return test;
    }
}
