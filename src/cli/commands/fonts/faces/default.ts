import { faceRef } from '../../../../sdk/adapty/index.js';
import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { faceIdArg } from '../../../input/fonts.js';
import { renderChangedFamily } from '../../../views/fonts.js';

import type { FontFamilyWriteResult } from '../../../../sdk/adapty/index.js';
import type { FlowsToPublish } from '../../../base/adapty/index.js';

export default class FontsFacesDefault extends FontsCommand {
    static override args = { ...faceIdArg };
    static override description = 'Make a face the default face of its family; the face that was the default stops being it';
    static override examples = ['<%= config.bin %> fonts faces default FACE_UUID --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<FlowsToPublish & FontFamilyWriteResult> {
        const { args, flags } = await this.parse(FontsFacesDefault);
        const located = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = faceRef(located);
        const result = await this.adapty.fonts.faces.update(flags.app, ref, { isDefault: true });
        const flows = await this.flowsToPublish(flags.app, [result.id]);

        this.render(result, value => renderChangedFamily(value, flows.flows_to_publish, flags.app));

        return { ...result, ...flows };
    }
}
