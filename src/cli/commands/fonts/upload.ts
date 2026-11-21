import { Args } from '@oclif/core';

import { FontsCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { choiceFlag, choiceValue, readFontFiles } from '../../input/fonts.js';
import { renderPackage } from '../../views/fonts.js';

import type { FontPackageReport } from '../../base/adapty/index.js';

export default class FontsUpload extends FontsCommand {
    static override args = {
        file: Args.string({ description: 'A .ttf or .otf file; give several to upload a package', required: true }),
    };

    static override description = [
        'Upload font files, one request per file, and report each file at the end.',
        'The server reads the family name inside each file: the file joins the family of that name (any case), or creates it.',
        'A static file gives one face, a variable file one face per named instance. A file that collides with stored faces',
        '(same weight and italic, or an iOS name another face holds) is refused with every one of them: run again with',
        '--choice replace to put the file on all of them, or --choice keep to skip the file. With --choice replace the',
        'file is sent without a choice first and, when it collides, once more to replace the faces the refusal lists;',
        'when the collisions changed in between, it is refused again with the new ones.',
        'Exit 4 when a file was refused (after the report of every file). A network failure (exit 5) or an auth failure',
        '(exit 3) stops the package: the files after it are reported as not sent.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> fonts upload --app UUID Brand-Regular.otf Brand-Bold.otf Brand-Italic.otf',
        '<%= config.bin %> fonts upload --app UUID Brand-Bold.otf --choice replace',
    ];

    static override flags = { ...appIdFlag, ...choiceFlag };
    static override strict = false;

    async run(): Promise<FontPackageReport> {
        const { argv, flags } = await this.parse(FontsUpload);
        const files = await readFontFiles(argv as string[]);
        const choice = choiceValue(flags.choice);

        const report = await this.sendPackage(files, file => this.adapty.fonts.upload(flags.app, file, choice), {
            appId: flags.app,
            retry: path => `adapty fonts upload --app ${flags.app} ${path}`,
        });

        this.render(report, value => renderPackage(value, flags.app));

        return report;
    }
}
