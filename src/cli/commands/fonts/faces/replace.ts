import { Args } from '@oclif/core';

import { faceRef } from '../../../../sdk/adapty/index.js';
import { FontsCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { canAsk, confirmAction, yesFlag } from '../../../input/confirm.js';
import { faceIdArg, italicValue, pairFlags, readFontFile } from '../../../input/fonts.js';
import { faceLabel, renderChangedFamily } from '../../../views/fonts.js';

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
        'The old file cannot be restored, so it asks first: --yes replaces without asking, and with --json, a pipe or no',
        'terminal the command does nothing without --yes (exit 6).',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> fonts faces replace FACE_UUID Brand-Bold.otf --app UUID',
        '<%= config.bin %> fonts faces replace FACE_UUID Brand-Variable.ttf --app UUID --weight 700 --italic false --yes',
    ];

    static override flags = { ...appIdFlag, ...pairFlags, ...yesFlag };

    async run(): Promise<FlowsToPublish & FontFamilyWriteResult> {
        const { args, flags } = await this.parse(FontsFacesReplace);
        const file = await readFontFile(args.file);
        const lost = 'The old file is not kept and cannot be restored.';
        const ask = { interactive: this.interactive, signal: this.signal, yes: flags.yes };

        // Nobody can answer: refused before any request, the face named by the id given
        if (!canAsk(ask)) {
            await confirmAction({ ...ask, effect: `Replace the file of font face ${args.face_id} with ${file.name}. ${lost}` });
        }

        const located = await this.adapty.fonts.findFace(flags.app, args.face_id);
        const ref = faceRef(located);

        await confirmAction({
            ...ask,
            effect: `Replace the file of font face ${located.face.id} (${faceLabel(located.face)}) of the family `
                + `${located.family.name} (${located.family.id}) with ${file.name}. ${lost}`,
        });

        const result = await this.adapty.fonts.faces.replace(flags.app, ref, file, {
            italic: italicValue(flags.italic),
            weight: flags.weight,
        });

        const flows = await this.flowsToPublish(flags.app, [result.id]);

        this.render(result, value => renderChangedFamily(value, flows.flows_to_publish, flags.app));

        return { ...result, ...flows };
    }
}
