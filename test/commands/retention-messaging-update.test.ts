import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import { restoreFetch } from '../helpers/mock-fetch.js';
import { opaquePng } from '../helpers/png.js';
import {
    APP,
    defaultBody,
    defaultMessage,
    formData,
    MESSAGE,
    promoBody,
    promoMessage,
    runCli,
    sent,
    serve,
    tempFolder,
    useStreams,
    writes,
} from '../helpers/retention-messaging.js';

import type * as sinon from 'sinon';

const update = ['retention-messaging', 'messages', 'update', MESSAGE, '--app', APP];

describe('retention-messaging messages update', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;
    let files: Awaited<ReturnType<typeof tempFolder>>;

    beforeEach(async () => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
        files = await tempFolder();
    });

    afterEach(async () => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        restoreStreams();
        await files.remove();
        delete process.env.ADAPTY_TOKEN;
    });

    /** Runs an update with a change file, after a read that answers `message`. */
    const runChange = async (message: unknown, change: object | undefined, extra: string[] = ['--yes']) => {
        fetchStub = serve([{ body: { data: message } }, { body: { data: message } }]);

        const file = change === undefined ? [] : ['--file', await files.write('change.json', JSON.stringify(change))];
        const result = await runCli([...update, ...file, ...extra]);

        return { ...result, put: writes(fetchStub)[0], requests: sent(fetchStub) };
    };

    // external: the full body of the PUT differs from the read only by what the change names
    describe('the full body of the update', () => {
        const de = (body: Record<string, unknown>, deBody: string) => ({
            ...body,
            localizations: (body.localizations as Record<string, unknown>[]).map(item => (item.locale === 'de-DE' ? { ...item, body: deBody } : item)),
        });

        const twoLocales = defaultMessage({ localizations: (defaultMessage().localizations as unknown[]).slice(0, 2) });
        const twoBody = defaultBody({ localizations: (defaultBody().localizations as unknown[]).slice(0, 2) });

        type Row = { change?: object; expected: object; extra?: string[]; id: string; message: object };

        const rows: Row[] = [
            {
                change: { localizations: [{ body: 'Neu', locale: 'de-DE' }] },
                expected: de(defaultBody(), 'Neu'),
                id: '(a) default: only the body of de-DE',
                message: defaultMessage(),
            },
            {
                change: { localizations: [{ body: 'Neu', locale: 'de-DE' }] },
                expected: de(promoBody(), 'Neu'),
                id: '(b) promo: the association stays',
                message: promoMessage(),
            },
            { change: { products: [{ store_id: 'annual' }] }, expected: promoBody(), id: 'a product edit with no association keeps it', message: promoMessage() },
            {
                change: { products: [{ association: null, store_id: 'annual' }] },
                expected: promoBody({ products: [{ store_id: 'annual' }] }),
                id: 'association null removes it',
                message: promoMessage(),
            },
            {
                change: { products: [{ association: { store_id: 'promo.third', type: 'promo_offer' }, store_id: 'annual' }] },
                expected: promoBody({ products: [{ association: { store_id: 'promo.third', type: 'promo_offer' }, store_id: 'annual' }] }),
                id: 'a given association replaces it',
                message: promoMessage(),
            },
            {
                change: { remove_localizations: ['fr-FR'] },
                expected: defaultBody({ localizations: (twoBody.localizations as unknown[]).slice(0, 1) }),
                id: 'remove_localizations fr-FR',
                message: twoLocales,
            },
            {
                change: { remove_bullet_points: ['b2'] },
                expected: {
                    ...twoBody,
                    bullet_points: [{ alt_text: 'Icon one', bullet_id: 'b1', text: 'One' }],
                    localizations: [
                        { body: 'Text', bullet_points: [{ text: 'Eins' }], locale: 'de-DE', title: 'Titel' },
                        { body: 'Texte', bullet_points: [{ text: 'Un' }], locale: 'fr-FR', title: 'Titre' },
                    ],
                },
                id: 'remove_bullet_points b2',
                message: twoLocales,
            },
            { change: { remove_products: ['monthly'] }, expected: { ...twoBody, products: [{ store_id: 'annual' }] }, id: 'remove_products', message: twoLocales },
            { expected: { ...twoBody, remove_image: true }, extra: ['--remove-image', '--yes'], id: '--remove-image', message: twoLocales },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const { error, put } = await runChange(row.message, row.change, row.extra);

                expect(error, 'error').to.equal(undefined);
                expect(put?.method, 'PUT').to.equal('PUT');
                expect(formData(put), 'body').to.deep.equal(row.expected);
                expect((put?.body as FormData).has('image'), 'image part').to.equal(false);
                expect((put?.body as FormData).getAll('bullet_images'), 'icon parts').to.deep.equal([]);
            });
        }
    });

    // external: a conflict of the input is refused with exit 2 (not 6) before the question and any request
    describe('conflicts of the input', () => {
        const rows: { change?: object; extra?: string[]; id: string; text: string }[] = [
            {
                change: { localizations: [{ body: 'x', locale: 'de-DE' }], remove_localizations: ['de-DE'] },
                id: 'localization',
                text: 'localization de-DE is both in localizations and in remove_localizations',
            },
            {
                change: { bullet_points: [{ bullet_id: 'b1', text: 'x' }], remove_bullet_points: ['b1'] },
                id: 'bullet point',
                text: 'bullet point b1 is both in bullet_points and in remove_bullet_points',
            },
            {
                change: { products: [{ store_id: 'annual' }], remove_products: ['annual'] },
                id: 'product',
                text: 'product annual is both in products and in remove_products',
            },
            { extra: ['--image', 'new.png', '--remove-image'], id: '--image and --remove-image', text: 'a new image (--image) and its removal' },
            { change: { title: 'B' }, extra: ['--title', 'A'], id: '--title and title in the file', text: '--title and title in the change file are both given' },
            {
                change: { bullet_points: [{ image_path: 'icon.png', text: 'New', texts: { 'de-DE': 'Neu' } }], remove_localizations: ['de-DE'] },
                id: 'text of a new bullet point for a removed locale',
                text: 'bullet_points[0].texts has a text for de-DE, which remove_localizations removes',
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const { error, requests } = await runChange(defaultMessage(), row.change, row.extra ?? []);

                expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                expect(error?.message).to.contain(row.text);
                expect(requests, 'requests').to.deep.equal([]);
            });
        }
    });

    // external: what the read shows makes the update impossible: exit 2 after the GET, no PUT
    describe('refused after the read', () => {
        const twoLocales = defaultMessage({ localizations: (defaultMessage().localizations as unknown[]).slice(0, 2) });
        const { localizations: _dropped, ...noLocalizations } = defaultMessage();

        type Row = { change?: object; extra?: string[]; icon?: boolean; id: string; message?: unknown; text: string };

        const rows: Row[] = [
            { change: { remove_localizations: ['pt-BR'] }, id: 'a localization the message has not', text: 'remove_localizations: the message has no localization pt-BR' },
            { change: { remove_bullet_points: ['b9'] }, id: 'a bullet point of another message', text: 'remove_bullet_points: the message has no bullet point b9' },
            { change: { remove_products: ['weekly'] }, id: 'a product not in the message', text: 'remove_products: the message has no product weekly' },
            { change: { bullet_points: [{ bullet_id: 'b9', text: 'x' }] }, id: 'an edit of a bullet_id the message has not', text: 'bullet_points: the message has no bullet point b9' },
            {
                change: { localizations: [{ bullet_texts: { b9: 'x' }, locale: 'de-DE' }] },
                id: 'a bullet text key the message has not',
                text: 'localizations (de-DE).bullet_texts: the message has no bullet point b9',
            },
            { change: { localizations: [{ locale: 'it-IT', title: 'Titolo' }] }, id: 'a new locale with no body', text: 'the new localization it-IT needs title and body' },
            {
                change: { localizations: [{ body: 'Testo', bullet_texts: { b1: 'Uno' }, locale: 'it-IT', title: 'Titolo' }] },
                id: 'a new locale with no text for a kept bullet point',
                text: 'localization it-IT has no text for bullet point b2',
            },
            { extra: ['--title', 'New', '--yes'], id: 'the read has no localizations', message: noLocalizations, text: 'the message as read has no localizations' },
            {
                change: { bullet_points: [{ image_path: 'icon.png', text: 'New', texts: { 'de-DE': 'Neu' } }] },
                icon: true,
                id: 'a new bullet point with no text for fr-FR',
                message: twoLocales,
                text: 'has no text for fr-FR',
            },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                if (row.icon === true) {
                    await files.write('icon.png', opaquePng(1024, 1024));
                }

                const { error, requests } = await runChange(row.message ?? defaultMessage(), row.change, row.extra);

                expect(error?.oclif?.exit, 'exit').to.equal(exitCode.usage);
                expect(error?.message).to.contain(row.text);
                expect(requests.map(request => request.method), 'requests').to.deep.equal(['GET']);
            });
        }
    });

    // external: the question of an update names its effects and sends nothing when nobody can answer
    it('with no --yes and no terminal, exit 6 with the effect, no read and no write', async () => {
        const { error, requests } = await runChange(defaultMessage(), undefined, ['--title', 'New']);

        expect(error?.oclif?.exit, 'exit').to.equal(exitCode.confirmRequired);

        for (const text of ['sends the message to Apple review', 'starts to show again after Apple approves it', 'can be lost', 'Show this text to the user']) {
            expect(error?.message, text).to.contain(text);
        }

        expect(requests, 'requests').to.deep.equal([]);
    });
});
