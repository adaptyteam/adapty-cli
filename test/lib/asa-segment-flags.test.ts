import { expect } from 'chai';

import { buildAsaSegmentNaming } from '../../src/lib/asa-flags.js';

const campaign = (name: string, id: number) => ({ id: String(id), name });

describe('buildAsaSegmentNaming', () => {
    it('names a single campaign the way the dashboard does', () => {
        expect(buildAsaSegmentNaming('campaign', [campaign('LectMate_CN_Brand', 2144520245)])).to.deep.equal({
            description: 'Created from Apple Search Ads campaign "LectMate_CN_Brand".\n\nID: 2144520245',
            title: '[ASA] Campaign: LectMate_CN_Brand',
        });
    });

    it('previews three names and counts the rest for several campaigns', () => {
        const entities = [campaign('A', 1), campaign('B', 2), campaign('C', 3), campaign('D', 4)];

        expect(buildAsaSegmentNaming('campaign', entities)).to.deep.equal({
            description: 'Created from Apple Search Ads campaigns (4).\n\nPreview: A, B, C +1...\n\nIDs: 1, 2, 3 +1...',
            title: '[ASA] 4 campaigns: A, B, C +1...',
        });
    });

    it('uses the ad group and keyword wording', () => {
        expect(buildAsaSegmentNaming('ad-group', [campaign('US exact', 77)]).title).to.equal('[ASA] Ad group: US exact');

        expect(buildAsaSegmentNaming('keyword', [campaign('workflow', 5), campaign('tasks', 6)])).to.deep.equal({
            description: 'Created from Apple Search Ads keywords (2).\n\nPreview: workflow, tasks\n\nIDs: 5, 6',
            title: '[ASA] 2 keywords: workflow, tasks',
        });
    });

    it('truncates the title at 120 and the description at 240 characters', () => {
        const naming = buildAsaSegmentNaming('campaign', [campaign('x'.repeat(300), 1)]);

        expect(naming.title).to.have.length(120);
        expect(naming.title.endsWith('...')).to.equal(true);
        expect(naming.description).to.have.length(240);
    });
});
