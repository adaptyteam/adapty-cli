import { expect } from 'chai';

import { hintJson, withHint } from '../../../src/cli/errors/hints.js';
import {
    contentTime,
    duplicatedLine,
    EMPTY_HISTORY,
    renamedLine,
    renderVersion,
    renderVersionList,
    replaceDraftQuestion,
    replaceDraftRefusal,
    restoredLine,
} from '../../../src/cli/views/flow-versions.js';

import type { FlowVersionDetail, FlowVersionRow } from '../../../src/sdk/adapty/index.js';

const draft: FlowVersionRow = {
    created_at: '2026-11-08T08:00:00Z',
    flow_version_id: 'd-1',
    is_current: true,
    last_edited_by: null,
    name: null,
    publication_status: null,
    published_at: null,
    state: 'draft',
    title: 'Version 2',
    updated_at: Date.UTC(2026, 10, 9, 10, 15),
    version: 1,
};

const page = (data: FlowVersionRow[]) => ({ data, meta: { pagination: { count: data.length, page: 1, pages: 1 } } });

describe('flow version views', () => {
    it('renderVersionList: the empty-history text only without a search', () => {
        expect(renderVersionList(page([draft]), false).split('\n')[0]).to.equal(EMPTY_HISTORY);
        expect(renderVersionList(page([draft]), true)).not.to.contain(EMPTY_HISTORY);
        expect(renderVersionList(page([]), false)).to.equal('History will appear after the first publish.');
    });

    it('renderVersion: the row fields and the preview link, not the content', () => {
        const version = { ...draft, preview_url: 'https://example.com/p', screens: ['secret'] } as FlowVersionDetail;
        const text = renderVersion(version);

        expect(text).to.contain('https://example.com/p').and.to.contain('Version 2').and.not.to.contain('secret');
        expect(text).to.contain('--output <file> writes it');
        expect(renderVersion(version, true)).not.to.contain('--output');
    });

    it('contentTime: minutes in UTC', () => {
        expect(contentTime(Date.UTC(2026, 10, 9, 10, 15, 42))).to.equal('2026-11-09 10:15 UTC');
    });

    it('replaceDraftQuestion and replaceDraftRefusal: "another user" for an unknown editor, the token when nobody can answer', () => {
        expect(replaceDraftQuestion(draft, 'Black Friday')).to.equal(
            'Replace the draft \'Version 2\' (last change 2026-11-09 10:15 UTC by another user) with \'Black Friday\'? '
            + 'To keep the draft, duplicate it to a new flow first.',
        );

        expect(replaceDraftRefusal(draft, 'Black Friday').split('\n')).to.deep.equal([
            replaceDraftQuestion(draft, 'Black Friday'),
            `To replace it, re-run with --yes --expected-updated-at ${draft.updated_at} (the draft's updated_at).`,
        ]);
    });

    it('restoredLine, renamedLine and duplicatedLine name what changed', () => {
        expect(restoredLine('Black Friday', draft)).to.equal('Restored \'Black Friday\' as the draft \'Version 2\' (d-1). Nothing is published.');
        expect(renamedLine(draft)).to.equal('Version d-1 is now \'Version 2\'.');
        expect(duplicatedLine({ id: 'f-2', name: 'Onboarding_copy' })).to.equal('New flow \'Onboarding_copy\' (f-2), not published.');
    });
});

describe('API error hints', () => {
    it('withHint and hintJson add the next step for a known code only', () => {
        expect(withHint('Flow version is already being published.', 'flow_publishing'))
            .to.equal('Flow version is already being published.\nWait until the publish ends.');

        expect(withHint('Bad.', 'validation_error')).to.equal('Bad.');
        expect(withHint('Bad.', undefined)).to.equal('Bad.');
        expect(hintJson('flow_config_conflict')).to.deep.equal({ hint: 'List the versions again and retry.' });

        expect(hintJson('flow_archived')).to.deep.equal({
            hint: 'The flow is archived. Restore it from the archive in the dashboard first.',
        });

        expect(hintJson('validation_error')).to.deep.equal({});
    });
});
