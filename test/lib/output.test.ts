import {expect} from 'chai'

import {printResponse} from '../../src/lib/output.js'

function render(data: Record<string, unknown>): string[] {
  const lines: string[] = []
  printResponse(data, (msg) => lines.push(msg))
  return lines
}

describe('printResponse', () => {
  it('skips empty arrays instead of printing a bare label', () => {
    const lines = render({errors: [], internal_id: 'abc', keywords: []})
    expect(lines).to.deep.equal(['Internal ID: abc'])
  })

  it('keeps scalar arrays on one line', () => {
    const lines = render({countries_or_regions: ['US', 'GB'], name: 'Winter push'})
    expect(lines).to.deep.equal(['Countries Or Regions: US, GB', 'Name: Winter push'])
  })

  it('renders a deep metrics overview structure one level per line', () => {
    const lines = render({
      gross: {
        by_days: {
          data: [
            {day: 7, values: [{x: '2026-07-01', y: '3.1'}]},
            {day: 90, values: [{x: '2026-07-01', y: '9.8'}]},
          ],
        },
        total: {
          data: [
            {values: [{x: '2026-07-01', y: '12.5'}, {x: '2026-07-02', y: '14.0'}]},
          ],
        },
      },
      metric: 'revenue',
    })
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
    ])
  })

  it('skips null and undefined fields at every depth', () => {
    const lines = render({budget: {amount: '50', currency: null}, end_time: null, name: 'x'})
    expect(lines).to.deep.equal(['Budget:', '  Amount: 50', 'Name: x'])
  })
})
