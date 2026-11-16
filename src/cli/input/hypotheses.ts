import { Args, Flags } from '@oclif/core';

import { usageError } from '../errors.js';

import { readJsonFile } from './json.js';
import { uuidParser } from './uuid.js';

import type { HypothesisCreateBody, ListHypothesesParams, ProductFill } from '../../sdk/adapty/index.js';

const idParser = (what: string, whereToLook: string) => uuidParser(`Invalid ${what} ID format. ${whereToLook}`);

const hypothesisParser = idParser('hypothesis', 'Run `adapty hypotheses list --app <app>` to find it.');
const placementParser = idParser('placement', 'Run `adapty placements list --app <app>` to find it.');
const segmentParser = idParser('segment', 'Run `adapty segments list --app <app>` to find it.');
const flowParser = idParser('flow', 'Run `adapty flows list --app <app>` to find it.');
const abTestParser = idParser('A/B test', 'Run `adapty ab-tests list --app <app>` to find it.');

/**
 * The filters go to the server comma separated, so a value with a comma would be read as two. A value
 * without a namespace matches nothing, so it is refused rather than listed as an empty page.
 */
const typeParser = (input: string): Promise<string> => {
    const value = input.trim();

    return /^[^\s,:]+:[^\s,:]+$/.test(value)
        ? Promise.resolve(value)
        : Promise.reject(usageError('--type takes one namespace:name (e.g. adapty:flow_design); repeat the flag for several.'));
};

/** The filters go to the server comma separated, so a value with a comma would be read as two. */
const oneValueParser = (flag: string) => (input: string): Promise<string> => {
    const value = input.trim();

    return value !== '' && !value.includes(',')
        ? Promise.resolve(value)
        : Promise.reject(usageError(`--${flag} takes one value; repeat the flag for several.`));
};

export const hypothesisIdArg = {
    hypothesis_id: Args.string({
        description: 'Hypothesis ID (UUID)',
        parse: hypothesisParser,
        required: true,
    }),
};

/** Every filter repeats, and the rows matching any of its values are listed. */
export const listFilterFlags = {
    'flow': Flags.string({ description: 'Only the hypotheses about this flow (ID); repeatable', multiple: true, parse: flowParser }),
    'order-by': Flags.string({
        description: 'Sort order: position (the default: the rows that need attention first, then the backlog order), '
            + 'created_at, -created_at or -resolved_at',
    }),
    'parent': Flags.string({
        description: 'Only the follow-ups of this hypothesis (ID); repeatable',
        multiple: true,
        parse: hypothesisParser,
    }),
    'phase': Flags.string({
        description: 'Only the hypotheses in this phase (the state, or for an accepted one test_draft, testing, ended or applied); '
            + 'repeatable',
        multiple: true,
        parse: oneValueParser('phase'),
    }),
    'placement': Flags.string({
        description: 'Only the hypotheses of this placement (ID), with those of other placements whose flow is shown here; repeatable',
        multiple: true,
        parse: placementParser,
    }),
    'segment': Flags.string({ description: 'Only the hypotheses about this segment (ID); repeatable', multiple: true, parse: segmentParser }),
    'state': Flags.string({
        description: 'Only the hypotheses in this state (proposed, accepted, dismissed, won, lost, inconclusive); repeatable',
        multiple: true,
        parse: oneValueParser('state'),
    }),
    'type': Flags.string({
        description: 'Only the hypotheses of this type, as namespace:name (e.g. adapty:flow_design); repeatable',
        multiple: true,
        parse: typeParser,
    }),
    'variant-flow': Flags.string({
        description: 'Only the hypotheses that test this flow as the variant (ID); repeatable',
        multiple: true,
        parse: flowParser,
    }),
};

type ListFilterFlags = {
    'flow'?: string[] | undefined;
    'order-by'?: string | undefined;
    'parent'?: string[] | undefined;
    'phase'?: string[] | undefined;
    'placement'?: string[] | undefined;
    'segment'?: string[] | undefined;
    'state'?: string[] | undefined;
    'type'?: string[] | undefined;
    'variant-flow'?: string[] | undefined;
};

export const listFilters = (flags: ListFilterFlags): ListHypothesesParams => ({
    flowIds: flags.flow,
    orderBy: flags['order-by'],
    parentHypothesisIds: flags.parent,
    phases: flags.phase,
    placementIds: flags.placement,
    segmentIds: flags.segment,
    states: flags.state,
    types: flags.type,
    variantFlowIds: flags['variant-flow'],
});

export const resultFlag = {
    result: Flags.string({ description: 'The verdict: won, lost or inconclusive', required: true }),
};

const PRODUCT_USAGE = '--product takes HYPOTHESIS_PRODUCT_ID=PRODUCT_ID: the product row of the hypothesis, then the product of the app that fills it.';

const productFillParser = idParser('product', 'Run `adapty products list --app <app>` to find it.');
const rowParser = idParser('hypothesis product', 'Run `adapty hypotheses get --app <app> HYPOTHESIS_ID` to see the product rows.');

const parseProductFill = async (input: string): Promise<ProductFill> => {
    const [row, product, ...rest] = input.split('=');

    if (row === undefined || product === undefined || rest.length > 0) {
        throw usageError(PRODUCT_USAGE);
    }

    return { hypothesisProductId: await rowParser(row.trim()), productId: await productFillParser(product.trim()) };
};

export const acceptFlags = {
    'placement-audience': Flags.string({
        description: 'The live audience of the placement that already carries the change (ID): required for an audience '
            + 'hypothesis; for a flow hypothesis shipped without an A/B test, with --variant-flow, the flow that audience shows. '
            + 'Each audience in adapty placements get carries it as Placement Audience ID (placement_audience_id in --json)',
        parse: uuidParser('Invalid placement audience ID format: it is a UUID, the Placement Audience ID of an audience in '
            + '`adapty placements get --app <app> <placement_id>`.'),
    }),
    'product': Flags.custom<ProductFill>({
        description: 'Fill a product row of the hypothesis: HYPOTHESIS_PRODUCT_ID=PRODUCT_ID; repeatable',
        multiple: true,
        // The hypothesis id may follow the flag: it is not one more value of it
        multipleNonGreedy: true,
        parse: parseProductFill,
    })(),
    'variant-flow': Flags.string({
        description: 'A flow hypothesis: the published flow to test against the current one (ID). It is set only here, '
            + 'when a proposed hypothesis is accepted: leave it out to take it from the A/B test linked later; '
            + 'to change it, unaccept and accept again',
        parse: flowParser,
    }),
};

export const abTestFlag = {
    'ab-test': Flags.string({
        description: 'The A/B test (ID): a flow test on the placement of the hypothesis, or a crossplacement test with a child there, '
            + 'whose arms are the current flow and the variant',
        parse: abTestParser,
        required: true,
    }),
};

const CREATE_USAGE = 'The file holds one create body, an array of them, or {"hypotheses": [...]}.';

const isObject = (value: unknown): value is HypothesisCreateBody =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** One body, an array of them, or a batch body as the server takes it: always a list of bodies. */
export const readCreateBodies = async (path: string): Promise<HypothesisCreateBody[]> => {
    const parsed = await readJsonFile(path);
    const source = path === '-' ? 'stdin' : path;

    if (isObject(parsed) && 'hypotheses' in parsed && !Array.isArray(parsed.hypotheses)) {
        throw usageError(`${source}: "hypotheses" must be an array. ${CREATE_USAGE}`);
    }

    const wrapped = isObject(parsed) && Array.isArray(parsed.hypotheses);

    if (wrapped) {
        const others = Object.keys(parsed).filter(key => key !== 'hypotheses');

        if (others.length > 0) {
            const forceHint = others.includes('force') ? ' Set force on each item, or pass --force.' : '';

            throw usageError(`${source}: {"hypotheses": [...]} takes no other key, found ${others.join(', ')}.${forceHint}`);
        }
    }

    const items: unknown = wrapped ? parsed.hypotheses : parsed;

    const list: unknown[] = Array.isArray(items) ? items : [items];

    return list.map((item, index) => {
        if (!isObject(item)) {
            throw usageError(`Item ${String(index + 1)} of ${source} is not a JSON object. ${CREATE_USAGE}`);
        }

        return item;
    });
};

export const dismissFlags = {
    reason: Flags.string({ description: 'Why the hypothesis is dismissed; a repeated dismiss with another reason is refused' }),
};
