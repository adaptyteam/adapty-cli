import { readdir, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { expect } from 'chai';

const SRC = join(import.meta.dirname, '..', '..', 'src');

/**
 * The pre-sdk stack is frozen: new work goes to src/sdk (the API) and src/cli (the adapter).
 * Eslint guards the imports between layers, but nothing stops a file from simply appearing here —
 * these lists do.
 *
 * They are also the migration's remaining scope: a line leaves when the module is ported, and
 * nothing is ever added.
 */
const FROZEN_LIB = [
    'api-client.ts',
    'api-schemas.ts',
    'app-url.ts',
    'asa-client.ts',
    'asa-flags.ts',
    'asa-keyword-action.ts',
    'asa-schemas.ts',
    'auth.ts',
    'client-from-config.ts',
    'config.ts',
    'confirm.ts',
    'errors.ts',
    'flags.ts',
    'flow-help.ts',
    'output.ts',
    'placement-audiences.ts',
    'preview.ts',
];

/** The commands still written against src/lib. A ported one turns into a re-export and drops out. */
const FROZEN_COMMANDS = [
    'access-levels/create.ts',
    'access-levels/get.ts',
    'access-levels/list.ts',
    'access-levels/update.ts',
    'asa/ad-groups/create.ts',
    'asa/ad-groups/get.ts',
    'asa/ad-groups/list.ts',
    'asa/ad-groups/update.ts',
    'asa/ads/create.ts',
    'asa/ads/get.ts',
    'asa/ads/list.ts',
    'asa/ads/update.ts',
    'asa/apps/list.ts',
    'asa/automations/create.ts',
    'asa/automations/get.ts',
    'asa/automations/list.ts',
    'asa/automations/run.ts',
    'asa/automations/runs.ts',
    'asa/automations/update.ts',
    'asa/campaigns/bulk-create.ts',
    'asa/campaigns/bulk-list.ts',
    'asa/campaigns/bulk-status.ts',
    'asa/campaigns/create.ts',
    'asa/campaigns/get.ts',
    'asa/campaigns/list.ts',
    'asa/campaigns/update.ts',
    'asa/competitors/summary.ts',
    'asa/connect.ts',
    'asa/creatives/list.ts',
    'asa/keywords/add.ts',
    'asa/keywords/list.ts',
    'asa/keywords/update.ts',
    'asa/metrics/index.ts',
    'asa/metrics/overview.ts',
    'asa/negative-keywords/add.ts',
    'asa/negative-keywords/list.ts',
    'asa/orgs/list.ts',
    'asa/product-pages/list.ts',
    'asa/product-pages/sync.ts',
    'asa/search-terms/list.ts',
    'asa/whoami.ts',
    'flows/config/get.ts',
    'flows/config/preview.ts',
    'flows/config/update.ts',
    'flows/config/validate.ts',
    'flows/create.ts',
    'flows/get.ts',
    'flows/list.ts',
    'flows/media/upload.ts',
    'flows/publish.ts',
    'flows/update.ts',
    'paywalls/create.ts',
    'paywalls/get.ts',
    'paywalls/list.ts',
    'paywalls/placements.ts',
    'paywalls/update.ts',
    'placements/create.ts',
    'placements/get.ts',
    'placements/list.ts',
    'placements/update.ts',
    'products/create.ts',
    'products/get.ts',
    'products/list.ts',
    'products/update.ts',
    'segments/get.ts',
    'segments/list.ts',
];

/** oclif discovers commands only under src/commands, so a ported one keeps a one-line file here. */
const SHIM = /^export \{ default \} from '(?:\.\.\/)+cli\/commands\/[\w./-]+\.js';$/;

const tsFiles = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });

    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1).split(sep).join('/'))
        .sort();
};

const isShim = async (file: string): Promise<boolean> => {
    const code = await readFile(join(SRC, 'commands', file), 'utf8');
    const lines = code.split('\n').map(line => line.trim()).filter(line => line !== '' && !line.startsWith('//'));

    return lines.length === 1 && SHIM.test(lines[0] ?? '');
};

/** Both directions: an addition is what this catches, a stale line would make the list a lie. */
const expectFrozen = (actual: readonly string[], frozen: readonly string[], place: string): void => {
    const added = actual.filter(file => !frozen.includes(file));
    const gone = frozen.filter(file => !actual.includes(file));

    expect(added, `${place} is frozen: new code belongs in src/sdk and src/cli`).to.deep.equal([]);
    expect(gone, `no longer in ${place}: drop these lines, the list tracks what is left to port`).to.deep.equal([]);
};

describe('the pre-sdk stack is frozen', () => {
    it('takes no new module in src/lib', async () => {
        expectFrozen(await tsFiles(join(SRC, 'lib')), FROZEN_LIB, 'src/lib');
    });

    it('takes no new hand-written command in src/commands', async () => {
        const files = await tsFiles(join(SRC, 'commands'));
        const shims = await Promise.all(files.map(file => isShim(file)));

        expectFrozen(files.filter((_, index) => shims[index] !== true), FROZEN_COMMANDS, 'src/commands');
    });
});
