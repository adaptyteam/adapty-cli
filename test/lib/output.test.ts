import { expect } from 'chai';

import { printResponse } from '../../src/lib/output.js';

function render(data: Record<string, unknown>): string[] {
    const lines: string[] = [];
    printResponse(data, msg => lines.push(msg));

    return lines;
}

describe('printResponse', () => {
    it('skips empty arrays instead of printing a bare label', () => {
        const lines = render({ errors: [], internal_id: 'abc', keywords: [] });
        expect(lines).to.deep.equal(['Internal ID: abc']);
    });

    it('keeps scalar arrays on one line', () => {
        const lines = render({ countries_or_regions: ['US', 'GB'], name: 'Winter push' });
        expect(lines).to.deep.equal(['Countries Or Regions: US, GB', 'Name: Winter push']);
    });

    it('renders a deep metrics overview structure one level per line', () => {
        const lines = render({
            gross: {
                by_days: {
                    data: [
                        { day: 7, values: [{ x: '2026-07-01', y: '3.1' }] },
                        { day: 90, values: [{ x: '2026-07-01', y: '9.8' }] },
                    ],
                },
                total: {
                    data: [
                        { values: [{ x: '2026-07-01', y: '12.5' }, { x: '2026-07-02', y: '14.0' }] },
                    ],
                },
            },
            metric: 'revenue',
        });

        expect(lines).to.deep.equal([
            'Gross:',
            '  By Days:',
            '    Data:',
            '      - Day: 7',
            '        Values:',
            '          - X: 2026-07-01',
            '            Y: 3.1',
            '      - Day: 90',
            '        Values:',
            '          - X: 2026-07-01',
            '            Y: 9.8',
            '  Total:',
            '    Data:',
            '      - Values:',
            '          - X: 2026-07-01',
            '            Y: 12.5',
            '          - X: 2026-07-02',
            '            Y: 14.0',
            'Metric: revenue',
        ]);
    });

    it('skips null and undefined fields at every depth', () => {
        const lines = render({ budget: { amount: '50', currency: null }, end_time: null, name: 'x' });
        expect(lines).to.deep.equal(['Budget:', '  Amount: 50', 'Name: x']);
    });

    it('renders a ~5 MiB wide array without overflowing the stack', () => {
        // 150k items × ~35 bytes: a large flow builder config. Spreading the rendered lines into
        // push() used to throw "Maximum call stack size exceeded" around 100k items.
        const items = Array.from({ length: 150_000 }, (_, i) => ({ id: `element-${i}`, kind: 'text' }));
        const data = { config: { screens: items }, status: 'draft' };
        expect(Buffer.byteLength(JSON.stringify(data))).to.be.greaterThan(5 * 1024 * 1024);

        const lines = render(data);
        expect(lines).to.have.length(2 + items.length * 2 + 1);
        expect(lines[0]).to.equal('Config:');
        expect(lines[1]).to.equal('  Screens:');
        expect(lines[2]).to.equal('    - ID: element-0');
        expect(lines.at(-1)).to.equal('Status: draft');
    });

    it('caps recursion depth and prints the rest of a >5000-level structure as JSON', () => {
        let leaf: Record<string, unknown> = { value: 'bottom' };

        for (let i = 0; i < 6000; i++) {
            leaf = { child: leaf };
        }

        const lines = render({ root: leaf });
        expect(lines[0]).to.equal('Root:');
        expect(lines).to.have.length.lessThan(100);

        const last = lines.at(-1) ?? '';
        expect(last.trimStart()).to.match(/^Child: \{"child":\{"child":/);
        expect(last.endsWith('…')).to.equal(true);
    });

    it('caps depth inside arrays too, and survives a subtree JSON.stringify itself cannot serialize', () => {
        // 6000 array+object pairs is ~12k levels: past even JSON.stringify's own recursion limit.
        let leaf: unknown = ['bottom'];

        for (let i = 0; i < 6000; i++) {
            leaf = [{ inner: leaf }];
        }

        const lines = render({ root: leaf });
        expect(lines[0]).to.equal('Root:');
        expect(lines).to.have.length.lessThan(200);
        expect(lines.at(-1)?.trimStart()).to.equal('- Inner: [nested too deep to print]');
    });
});
