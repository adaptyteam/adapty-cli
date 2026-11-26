import { Args } from '@oclif/core';

import { FontsCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { choiceFlag, choiceValue, familyIdArg, readFontFiles } from '../../input/fonts.js';
import { renderPackage } from '../../views/fonts.js';

import type { FontFile } from '../../../sdk/adapty/index.js';
import type { FontPackageReport } from '../../base/adapty/index.js';

export default class FontsAdd extends FontsCommand {
    static override args = {
        ...familyIdArg,
        file: Args.string({ description: 'A .ttf or .otf file; give several to add a package', required: true }),
    };

    static override description = [
        'Add the faces of font files to a chosen family, whatever family name the files carry; one request per file.',
        'Collisions and refusals work as in `fonts upload`. Use the printed retry with --choice replace and',
        '--replace-face-id to replace exactly the faces shown, or --choice keep to skip the file.',
        'Exit 4 when a file was refused (after the report of every file). A network failure (exit 5) or an auth failure',
        '(exit 3) stops the package: the files after it are reported as not sent.',
    ].join('\n');

    static override examples = ['<%= config.bin %> fonts add FAMILY_UUID --app UUID Inter-Bold.ttf'];
    static override flags = { ...appIdFlag, ...choiceFlag };
    static override strict = false;

    async run(): Promise<FontPackageReport> {
        const { args, argv, flags } = await this.parse(FontsAdd);
        // argv holds every positional: the family first, then the files
        const choice = choiceValue(flags, argv.length - 1);
        const files = await readFontFiles((argv as string[]).slice(1));

        const send = (file: FontFile) => this.adapty.fonts.add(flags.app, args.family_id, file, choice);

        const report = await this.sendPackage(files, send, {
            appId: flags.app,
            retry: path => `adapty fonts add ${args.family_id} --app ${flags.app} ${path}`,
        });

        this.render(report, value => renderPackage(value, flags.app));

        return report;
    }
}
