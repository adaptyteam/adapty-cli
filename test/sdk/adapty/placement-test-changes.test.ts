import { expect } from 'chai';

import { placementTestChanges } from '../../../src/sdk/adapty/index.js';

import type { AudienceEntry } from '../../../src/sdk/adapty/placement-test-changes.js';

const abTest = (id: string, segments: string[], title?: string): AudienceEntry => ({
    ab_test_id: id,
    ab_test_title: title,
    content_type: 'ab_test',
    segment_ids: segments,
});

const paywall = (segments: string[]): AudienceEntry => ({ content_type: 'paywall', segment_ids: segments });

const messages = (current: AudienceEntry[], next: AudienceEntry[]): string[] => {
    return placementTestChanges(current, next).map(issue => issue.message);
};

describe('placementTestChanges', () => {
    it('finds nothing when the tests keep their ids and segments', () => {
        expect(messages([abTest('t1', ['a'], 'One'), paywall([])], [paywall([]), abTest('t1', ['a'])])).to.deep.equal([]);
    });

    it('treats the segments as a set: the order and repeats do not matter', () => {
        expect(messages([abTest('t1', ['a', 'b'])], [abTest('t1', ['b', 'a', 'a'])])).to.deep.equal([]);
    });

    it('stops a running test whose audience gets a paywall, and uses the title', () => {
        expect(messages([abTest('t1', ['a'], 'One')], [paywall(['a'])])).to.deep.equal(['test One stops with no winner']);
    });

    it('falls back to the id when the entry has no title', () => {
        expect(messages([abTest('t1', ['a'])], [])).to.deep.equal(['test t1 stops with no winner']);
    });

    it('starts again a test that moves to other segments, with one line and no stop', () => {
        expect(messages([abTest('t1', ['a'], 'One')], [abTest('t1', ['b'])])).to.deep.equal([
            'test One starts again with a new start time',
        ]);
    });

    it('starts a test id that does not run here, on its audience or on All users', () => {
        expect(messages([], [abTest('t2', ['a']), abTest('t3', [])])).to.deep.equal([
            'test t2 starts on audience segment a',
            'test t3 starts on audience All users',
        ]);
    });

    it('stops one test and starts another on the same audience', () => {
        expect(messages([abTest('t1', ['a'], 'One')], [abTest('t2', ['a'], 'Two')])).to.deep.equal([
            'test One stops with no winner',
            'test Two starts on audience segment a',
        ]);
    });

    it('gives one line per test, also for two tests with the same title', () => {
        expect(messages([abTest('t1', ['a'], 'Same'), abTest('t2', ['b'], 'Same')], [])).to.deep.equal([
            'test Same stops with no winner',
            'test Same stops with no winner',
        ]);
    });

    it('does not read crossplacement entries on either side', () => {
        const cross = (id: string, segments: string[]): AudienceEntry => ({
            ab_test_id: id,
            content_type: 'cross_ab_test',
            segment_ids: segments,
        });

        expect(messages([cross('c1', ['a'])], [cross('c2', ['b'])])).to.deep.equal([]);
    });

    it('reads flow tests like paywall tests', () => {
        const flowTest: AudienceEntry = { ab_test_id: 'f1', ab_test_title: 'Flow', content_type: 'flow_ab_test', segment_ids: [] };

        expect(messages([flowTest], [])).to.deep.equal(['test Flow stops with no winner']);
    });
});
