import { Flags } from '@oclif/core';

import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { faceIdArg } from '../../../input/fonts.js';
import { uuidParser } from '../../../input/uuid.js';
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
        to: Flags.string({
            description: 'Target font family ID (UUID)',
            parse: uuidParser('Invalid font family ID format. Run `adapty fonts list --app <app>` to find it.'),
            required: true,
        }),
    };

    async run(): Promise<FlowsToPublish & FontFamily> {
        const { args, flags } = await this.parse(FontsFacesMove);
        const { family } = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = { faceId: args.face_id, familyId: family.id };
        const target = await this.adapty.fonts.faces.move(flags.app, ref, flags.to);
        const flows = await this.flowsToPublish(flags.app, [family.id, target.id]);

        this.render(target, value => renderChangedFamily(value, flows, flags.app));

        return { ...target, flows_to_publish: flows };
    }
}
