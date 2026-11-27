import { Flags } from '@oclif/core';

import { AdaptyCommand, flowIdArg } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { uuidParser } from '../../input/uuid.js';
import { copiedToAppLines } from '../../views/flow-versions.js';

import type { FlowCopyToApp } from '../../../sdk/adapty/index.js';

export default class FlowsCopy extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'Copy a flow to another app of the same company: a new unpublished flow with the source '
        + 'name and the content of the current version (the draft, else the live one). The source flow does not change. '
        + 'The answer lists what to check before the publish';

    static override examples = [
        '<%= config.bin %> flows copy FLOW_UUID --app SOURCE_APP_UUID --to-app TARGET_APP_UUID',
    ];

    static override flags = {
        ...appIdFlag,
        'to-app': Flags.string({
            description: 'The app to copy the flow to (UUID), another app of the same company',
            parse: uuidParser('Invalid app ID format. Run `adapty apps list` to find your app ID.'),
            required: true,
        }),
    };

    async run(): Promise<FlowCopyToApp> {
        const { args, flags } = await this.parse(FlowsCopy);
        const copy = await this.adapty.flows.copyToApp(flags.app, args.flow_id, flags['to-app']);

        this.render(copy, copiedToAppLines);

        return copy;
    }
}
