import { validateWrite } from '../../../sdk/adapty/ab-tests/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, abTestWriteFlags, placementFlag, plannedAudienceFlags, segmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail, AbTestWriteInput } from '../../../sdk/adapty/index.js';

export default class AbTestsUpdate extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Update an A/B test (the whole test is sent again). A started test changes only title and goal, and its audience cannot change; a completed or archived test cannot change at all';

    static override examples = [
        '<%= config.bin %> ab-tests update --app UUID TEST_ID --title "Price test (Q4)" --paywalls \'[{"paywall_id":"A","weight":70},{"paywall_id":"B","weight":30}]\'',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestWriteFlags,
        ...placementFlag('Placement the test is planned for (ID)'),
        ...plannedAudienceFlags,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsUpdate);

        const input: AbTestWriteInput = {
            flows: flags.flows,
            goal: flags.goal,
            paywalls: flags.paywalls,
            placementId: flags.placement,
            segmentIds: segmentIds(flags),
            title: flags.title,
        };

        assertValid(validateWrite(input));

        const test = await this.adapty.abTests.update(flags.app, args.ab_test_id, input);

        this.render(test, renderAbTest);

        return test;
    }
}
