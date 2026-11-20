import { faceRef } from '../../../../sdk/adapty/index.js';
import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { faceIdArg, familyIdFlag } from '../../../input/fonts.js';
import { renderChangedFamily } from '../../../views/fonts.js';

import type { FontFamily } from '../../../../sdk/adapty/index.js';
import type { FlowsToPublish } from '../../../base/adapty/index.js';

export default class FontsFacesMove extends FontsCommand {
    static override args = { ...faceIdArg };
    static override description = [
        'Move a face to another family, also a family of another font; its file does not change. Prints the target family.',
        'The default face of a family does not move, and a face with a known weight and italic does not move into a family',
        'that has that pair.',
    ].join('\n');

    static override examples = ['<%= config.bin %> fonts faces move FACE_UUID --to FAMILY_UUID --app UUID'];
    static override flags = {
        ...appIdFlag,
        ...familyIdFlag('Target font family ID (UUID)'),
    };

    async run(): Promise<FlowsToPublish & FontFamily> {
        const { args, flags } = await this.parse(FontsFacesMove);
        const located = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = faceRef(located);
        const target = await this.adapty.fonts.faces.move(flags.app, ref, flags.to);
        const flows = await this.flowsToPublish(flags.app, [located.family.id, target.id]);

        this.render(target, value => renderChangedFamily(value, flows.flows_to_publish, flags.app));

        return { ...target, ...flows };
    }
}
