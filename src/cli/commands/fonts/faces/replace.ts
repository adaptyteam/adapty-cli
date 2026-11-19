import { Args } from '@oclif/core';

import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { faceIdArg, italicValue, pairFlags, readFontFile } from '../../../input/fonts.js';
import { renderChangedFamily } from '../../../views/fonts.js';

import type { FontFamilyWriteResult } from '../../../../sdk/adapty/index.js';
import type { FlowsToPublish } from '../../../base/adapty/index.js';

export default class FontsFacesReplace extends FontsCommand {
    static override args = {
        ...faceIdArg,
        file: Args.string({ description: 'The new .ttf or .otf file of the face', required: true }),
    };

    static override description = [
        'Replace the file of a face. The face keeps its id, its default mark and its Android name; the iOS name follows',
        'the new file. The old file is not kept. A face whose weight and italic are not known needs --weight and --italic',
        'to take a variable file; a known pair cannot be changed by the file.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> fonts faces replace FACE_UUID Brand-Bold.otf --app UUID',
        '<%= config.bin %> fonts faces replace FACE_UUID Brand-Variable.ttf --app UUID --weight 700 --italic false',
    ];

    static override flags = { ...appIdFlag, ...pairFlags };

    async run(): Promise<FlowsToPublish & FontFamilyWriteResult> {
        const { args, flags } = await this.parse(FontsFacesReplace);
        const file = await readFontFile(args.file);
        const { family } = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = { faceId: args.face_id, familyId: family.id };

        const result = await this.adapty.fonts.faces.replace(flags.app, ref, file, {
            italic: italicValue(flags.italic),
            weight: flags.weight,
        });

        const flows = await this.flowsToPublish(flags.app, [result.id]);

        this.render(result, value => renderChangedFamily(value, flows, flags.app));

        return { ...result, flows_to_publish: flows };
    }
}
