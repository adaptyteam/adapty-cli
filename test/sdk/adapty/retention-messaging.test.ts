import { expect } from 'chai';

import { messageForm, planCreate } from '../../../src/sdk/adapty/retention-messaging/index.js';

const bytesOf = async (part: unknown): Promise<number[]> => [...new Uint8Array(await (part as Blob).arrayBuffer())];

describe('retention messaging form', () => {
    // external: each bullet point gets the icon part of its own file, also when the parts are in another order
    it('image_index of each bullet point names the part with its file, and data has no image_path', async () => {
        const one = { bytes: Uint8Array.from([1, 1, 1]), name: 'one.png' };
        const two = { bytes: Uint8Array.from([2, 2, 2]), name: 'two.png' };

        const plan = planCreate(
            { bullet_points: [{ image_path: 'one.png', text: 'One' }, { image_path: 'two.png', text: 'Two' }], name: 'Winter' },
            { icons: [one, two] },
        );

        // The parts in the reverse order of the bullet points
        const form = messageForm({ ...plan, icons: [...plan.icons].reverse() });
        const data = JSON.parse(form.get('data') as string) as { bullet_points: { image_index: number; text: string }[] };
        const parts = form.getAll('bullet_images');

        expect(data.bullet_points.map(bullet => Object.keys(bullet).sort()), 'keys').to.deep.equal([['image_index', 'text'], ['image_index', 'text']]);
        expect(await bytesOf(parts[data.bullet_points[0]?.image_index ?? -1]), 'One').to.deep.equal([1, 1, 1]);
        expect(await bytesOf(parts[data.bullet_points[1]?.image_index ?? -1]), 'Two').to.deep.equal([2, 2, 2]);
    });
});
