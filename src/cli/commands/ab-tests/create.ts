import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestWriteFlags, placementFlag, plannedAudienceFlags, segmentIds } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsCreate extends AdaptyCommand {
    static override description
        = 'Create a draft A/B test of paywalls or flows. A draft shows to no user until `ab-tests start` runs it. '
            + 'The weights must sum to 100 and there are 2 to 100 arms; the server checks both';

    static override examples = [
        '<%= config.bin %> ab-tests create --app APP_UUID --title "Price test" --placement PLACEMENT_UUID --paywalls \'[{"paywall_id":"A","weight":50},{"paywall_id":"B","weight":50}]\'',
        '<%= config.bin %> ab-tests create --app APP_UUID --title "Onboarding test" --flows \'[{"flow_id":"F1","weight":50,"title":"Short"},{"flow_id":"F2","weight":50}]\' --all-users',
    ];

    // The audience and the placement of a draft are only planned: `ab-tests start` names the ones that run
    static override flags = {
        ...appIdFlag,
        ...abTestWriteFlags,
        ...placementFlag('Placement the test is planned for (ID)'),
        ...plannedAudienceFlags,
    };

    async run(): Promise<AbTestDetail> {
        const { flags } = await this.parse(AbTestsCreate);

        const test = await this.adapty.abTests.create(flags.app, {
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
