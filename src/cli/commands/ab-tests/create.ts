import { validateWrite } from '../../../sdk/adapty/ab-tests/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestWriteFlags, plannedAudienceFlags, requiredPlacementFlag, segmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail, AbTestWriteInput } from '../../../sdk/adapty/index.js';

export default class AbTestsCreate extends AdaptyCommand {
    static override description = 'Create a draft A/B test of paywalls or flows; it needs a placement, and the kind of the test must match it';

    static override examples = [
        '<%= config.bin %> ab-tests create --app UUID --title "Price test" --placement UUID --paywalls \'[{"paywall_id":"A","weight":50},{"paywall_id":"B","weight":50}]\'',
        '<%= config.bin %> ab-tests create --app UUID --title "Flows" --placement UUID --flows \'[{"flow_id":"F1","weight":50},{"flow_id":"F2","weight":50}]\' --all-users',
    ];

    // The placement and audience of a draft are only planned: `ab-tests start` names the ones that run
    static override flags = {
        ...appIdFlag,
        ...abTestWriteFlags,
        ...requiredPlacementFlag('Placement the test is planned for (ID); the kind of the test must match it: a flow placement takes flow tests'),
        ...plannedAudienceFlags,
    };

    async run(): Promise<AbTestDetail> {
        const { flags } = await this.parse(AbTestsCreate);

        const input: AbTestWriteInput = {
            flows: flags.flows,
            goal: flags.goal,
            paywalls: flags.paywalls,
            placementId: flags.placement,
            segmentIds: segmentIds(flags),
            title: flags.title,
        };

        assertValid(validateWrite(input));

        const test = await this.adapty.abTests.create(flags.app, input);

        this.render(test, renderAbTest);

        return test;
    }
}
