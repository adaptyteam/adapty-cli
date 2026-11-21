import { Flags } from '@oclif/core';

import { faceRef, familiesOfFile, validateUpdateFontFace } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { faceIdArg, italicValue, pairFlags } from '../../../input/fonts.js';
import { renderChangedFamily } from '../../../views/fonts.js';

import type { FontFamilyWriteResult, UpdateFontFaceInput } from '../../../../sdk/adapty/index.js';
import type { FlowsToPublish } from '../../../base/adapty/index.js';

export default class FontsFacesUpdate extends FontsCommand {
    static override args = { ...faceIdArg };
    static override description = [
        'Change a face: its weight and italic (together; the pair is then confirmed), its iOS name, or its Android name.',
        'The Android name changes on every face of the same file. Paywalls that use a changed name follow it.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> fonts faces update FACE_UUID --app UUID --weight 600 --italic false',
        '<%= config.bin %> fonts faces update FACE_UUID --app UUID --ios-name BrandSans-Bold --android-name brand_sans',
    ];

    static override flags = {
        ...appIdFlag,
        ...pairFlags,
        'android-name': Flags.string({ description: 'Android font resource name: a lowercase letter, then lowercase letters, digits or _' }),
        'ios-name': Flags.string({ description: 'iOS font name (PostScript name); no other face of the app may have it' }),
    };

    async run(): Promise<FlowsToPublish & FontFamilyWriteResult> {
        const { args, flags } = await this.parse(FontsFacesUpdate);

        const input: UpdateFontFaceInput = {
            androidName: flags['android-name'],
            iosName: flags['ios-name'],
            italic: italicValue(flags.italic),
            weight: flags.weight,
        };

        // Before the token: an empty change needs no session
        assertValid(validateUpdateFontFace(input));

        const located = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = faceRef(located);
        const result = await this.adapty.fonts.faces.update(flags.app, ref, input);
        // An Android name is the file's: every family with a face of that file changed
        const changed = input.androidName === undefined ? [result.id] : [result.id, ...familiesOfFile(located)];
        const flows = await this.flowsToPublish(flags.app, changed);

        this.render(result, value => renderChangedFamily(value, flows.flows_to_publish, flags.app));

        return { ...result, ...flows };
    }
}
