import { expect } from 'chai';

import { createAdapty, fontConflict } from '../../../src/sdk/adapty/index.js';
import { ApiError } from '../../../src/sdk/core/errors.js';
import { createFakeClock, createScriptedFetch } from '../../../src/sdk/core/testing.js';
import { rejection } from '../../helpers/rejection.js';

const BASE = 'https://api.example.com/v1';
const APP = 'app-1';
const FILE = { content: new Uint8Array([0x4f, 0x54, 0x54, 0x4f]), name: 'Brand-Bold.otf' };

const setup = (script: Parameters<typeof createScriptedFetch>[0]) => {
    const scripted = createScriptedFetch(script);
    const adapty = createAdapty({ baseUrl: BASE, clock: createFakeClock(), fetch: scripted.fetch, token: 't' });

    return { calls: scripted.calls, fonts: adapty.fonts };
};

const FAMILY = {
    default_face_id: 'face-1',
    faces: [{ id: 'face-1' }],
    id: 'family-1',
    name: 'Brand',
};

describe('adapty.fonts', () => {
    /**
     * external: a new CLI on an older server must say which field is missing instead of printing "no
     * warnings" or "no flows" (a field an agent acts on).
     */
    describe('an answer without a list the caller acts on is an error that names it', () => {
        const rows: { call: (fonts: ReturnType<typeof setup>['fonts']) => Promise<unknown>; field: string; id: string }[] = [
            { call: fonts => fonts.list(APP), field: 'data', id: 'list' },
            { call: fonts => fonts.usage(APP, 'family-1'), field: 'flows', id: 'usage' },
            { call: fonts => fonts.upload(APP, FILE), field: 'warnings', id: 'upload' },
            { call: fonts => fonts.faces.update(APP, { faceId: 'face-1', familyId: 'family-1' }, { iosName: 'X' }), field: 'warnings', id: 'face update' },
        ];

        for (const row of rows) {
            it(row.id, async () => {
                const lists = ['created_faces', 'data', 'faces', 'flows', 'kept_faces', 'paywalls', 'replaced_faces', 'warnings'];
                const partial = Object.fromEntries(lists.filter(list => list !== row.field).map(list => [list, []]));

                const { fonts } = setup([{ body: partial }]);

                const error = await rejection(row.call(fonts));

                expect(error, row.id).to.be.instanceOf(ApiError);
                expect((error as ApiError).code, row.id).to.equal('malformed_response');
                expect((error as Error).message, row.id).to.include(row.field);
            });
        }
    });

    /** external: a face id of another app reads as the server's own refusal, exit 4 with its code. */
    it('findFace refuses a face the app does not have with font_face_not_found and sends nothing else', async () => {
        const { calls, fonts } = setup([{ body: { data: [FAMILY] } }]);

        const error = await rejection(fonts.findFace(APP, 'face-of-another-app'));

        expect(error).to.be.instanceOf(ApiError);
        expect(error).to.include({ code: 'font_face_not_found', status: 404 });
        expect(calls).to.have.length(1);
    });

    /** external: the colliding face and the choices are what the next step of a refused upload names. */
    describe('fontConflict', () => {
        const conflict = { face_id: 'face-1', family_id: 'family-1', family_name: 'Brand', font_alias_ios: 'Brand-Bold', italic: false, weight: 700 };

        const rows: { details: unknown; expected: unknown; id: string }[] = [
            { details: { choices: ['replace', 'keep'], conflict }, expected: { choices: ['replace', 'keep'], conflict }, id: 'a 409 with the choice' },
            { details: { error_code: 'font_faces_already_exist' }, expected: undefined, id: 'a refusal with no single face' },
        ];

        for (const row of rows) {
            it(row.id, () => {
                const error = new ApiError({ code: 'duplicate_custom_font_face', details: row.details, message: 'm', status: 409 });

                expect(fontConflict(error), row.id).to.deep.equal(row.expected);
            });
        }
    });
});
