import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { expect } from 'chai';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'src');
const COMMANDS = join(SRC, 'cli', 'commands');

/**
 * A command that outgrows one file becomes a directory: `apps/create/index.ts` is the command
 * (oclif collapses `index` into the directory's id) and `apps/create/lib/*.ts` is its own
 * business, nobody else's.
 *
 * Eslint blocks the flat spelling of a stranger's helper: the freeze on src/lib re-includes only
 * `./lib/*`, the lib next to the importer. Left over for here is what a specifier pattern cannot
 * see — a nested `lib/sub/x.js`, a `lib/` owned by a topic rather than by a command, and whether
 * oclif is still told to skip lib/ while looking for commands. The scan covers src only: a test is
 * free to reach into a command's lib to exercise it directly.
 */
const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

async function tsFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const found: string[] = [];

    for (const entry of entries) {
        const path = join(dir, entry.name);

        if (entry.isDirectory()) {
            found.push(...await tsFiles(path));
        } else if (entry.name.endsWith('.ts')) {
            found.push(path);
        }
    }

    return found;
}

/** The imported file, with the `.js` specifier mapped back to the source it names. */
function importedFile(file: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
        return undefined;
    }

    const target = resolve(dirname(file), specifier);

    return target.endsWith('.js') ? `${target.slice(0, -3)}.ts` : target;
}

/** `commands/<topic>/<name>/lib/render.ts` → `commands/<topic>/<name>`, the command that owns it. */
function ownerOf(file: string): string | undefined {
    if (!file.startsWith(COMMANDS + sep)) {
        return undefined;
    }

    const segments = file.slice(COMMANDS.length + 1).split(sep);
    const index = segments.indexOf('lib');

    return index === -1 ? undefined : join(COMMANDS, ...segments.slice(0, index));
}

describe('command layout', () => {
    let files: string[];

    before(async () => {
        files = await tsFiles(SRC);
    });

    it('keeps the lib/ of a command private to that command', async () => {
        const outsiders: string[] = [];

        for (const file of files) {
            const source = await readFile(file, 'utf8');

            for (const [, specifier] of source.matchAll(SPECIFIER)) {
                const imported = importedFile(file, specifier ?? '');
                const owner = imported === undefined ? undefined : ownerOf(imported);

                if (owner !== undefined && !file.startsWith(owner + sep)) {
                    outsiders.push(`${relative(SRC, file)} imports ${specifier}`);
                }
            }
        }

        expect(outsiders, 'move it to cli/views or cli/flags (adapter) or to sdk/adapty (product)').to.deep.equal([]);
    });

    it('lets only a command own a lib/, so no topic grows a shared one', () => {
        const known = new Set(files);

        const orphans = [...new Set(files.map(file => ownerOf(file)))]
            .filter(owner => owner !== undefined && !known.has(join(owner, 'index.ts')))
            .map(owner => relative(SRC, owner ?? ''));

        expect(orphans, 'a lib/ needs an index.ts next to it').to.deep.equal([]);
    });

    it('keeps a helper out of the command tree itself, where it would become a command', async () => {
        // The glob exempts `lib/` and nothing else, so `status/result.ts` next to `status/index.ts`
        // would ship as the command `auth status result`. A command file is the one that declares
        // the class oclif runs.
        const strays: string[] = [];

        for (const file of files.filter(candidate => candidate.startsWith(COMMANDS + sep))) {
            if (file.split(sep).includes('lib')) {
                continue;
            }

            const source = await readFile(file, 'utf8');

            if (!source.includes('export default class')) {
                strays.push(relative(SRC, file));
            }
        }

        expect(strays, 'a file that is not a command belongs in that command lib/').to.deep.equal([]);
    });

    it('tells oclif to skip lib/ when it looks for commands', async () => {
        // The reason cannot live in package.json, which has no comments: every file under the
        // command root becomes a command id, so `<cmd>/lib/render.js` would show up as the command
        // `<topic>:<cmd>:lib:render` and break `oclif manifest`.
        const pjson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
            oclif: { commands: { globPatterns?: string[]; strategy?: string } | string };
        };

        const { commands } = pjson.oclif;

        expect(commands, 'the string form takes oclif defaults, which see no exclusions').to.be.an('object');
        expect(typeof commands === 'string' ? undefined : commands.globPatterns).to.include('!**/lib/**');
    });
});
