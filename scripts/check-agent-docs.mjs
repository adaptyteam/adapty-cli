#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../oclif.manifest.json', import.meta.url));

const ATTRIBUTION_DOC = fileURLToPath(new URL('../docs/agent/attribution.md', import.meta.url));

const INVENTORY_DOCS = [
    fileURLToPath(new URL('../docs/agent/asa-management.md', import.meta.url)),
    fileURLToPath(new URL('../docs/agent/asa-metrics.md', import.meta.url)),
    ATTRIBUTION_DOC,
];

const SETUP_DOC = fileURLToPath(new URL('../docs/agent/skills/adapty-cli-setup/SKILL.md', import.meta.url));
const METRICS_DOC = fileURLToPath(new URL('../docs/agent/asa-metrics.md', import.meta.url));
const SKILL_REFERENCE = fileURLToPath(new URL('../skills/adapty-cli/references/cli-commands.md', import.meta.url));

const EXAMPLE_DOCS = [
    ...INVENTORY_DOCS,
    SETUP_DOC,
];

/** The topics whose commands the agent docs must cover. */
const TOPICS = ['asa', 'attribution'];
const TOPIC_PATTERN = TOPICS.join('|');

/**
 * Topics whose inventory row must name every flag, not only the required ones. `asa` rows keep the
 * original rule (required flags only).
 */
const FULL_FLAG_TOPICS = new Set(['attribution']);

/** Flags every command inherits; an inventory row does not repeat them. */
const GLOBAL_FLAGS = new Set(['json']);

const errors = [];
const fail = (file, line, message) => errors.push(`${relative(ROOT, file)}:${line}: ${message}`);
const normalizeNewlines = text => text.replaceAll(/\r\n?/g, '\n');
const topicOf = id => id.split(':')[0];
const spoken = id => id.replaceAll(':', ' ');

if (!existsSync(MANIFEST)) {
    console.error('oclif.manifest.json is missing; run `pnpm build && pnpm exec oclif manifest` first.');
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const commands = new Map(
    Object.entries(manifest.commands).filter(
        ([id, command]) => TOPICS.some(topic => id.startsWith(`${topic}:`)) && Array.isArray(command.relativePath),
    ),
);

const documented = new Map();

function cells(line) {
    return line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim());
}

const REFERENCE_CODE = new RegExp(`\`((?:${TOPIC_PATTERN})(?:\\s+[a-z][a-z-]*){1,2}(?:\\s+[^\`]*)?)\``);
const REFERENCE_COMMAND = new RegExp(`^(?:${TOPIC_PATTERN})(?:\\s+[a-z][a-z-]*){1,2}`);

function commandReference(cell) {
    const code = cell.match(REFERENCE_CODE)?.[1];

    if (!code) {
        return null;
    }

    const commandText = code.match(REFERENCE_COMMAND)?.[0];

    if (!commandText) {
        return null;
    }

    return { code, id: commandText.replaceAll(' ', ':') };
}

function resolveFlag(command, writtenName) {
    if (command.flags?.[writtenName]) {
        return writtenName;
    }

    if (writtenName.startsWith('no-')) {
        const positiveName = writtenName.slice(3);

        if (command.flags?.[positiveName]?.allowNo) {
            return positiveName;
        }
    }

    return null;
}

/** Flags written in a row must exist; required ones (or, for full-flag topics, all of them) must be written. */
function checkCommandRow(file, lineNumber, reference, command, flagsCell, { requireAllFlags }) {
    const writtenFlags = new Set();

    for (const match of flagsCell.matchAll(/`--([a-z][a-z0-9-]*)/g)) {
        const resolved = resolveFlag(command, match[1]);

        if (resolved) {
            writtenFlags.add(resolved);
        } else {
            fail(file, lineNumber, `${spoken(reference.id)} has no --${match[1]} flag`);
        }
    }

    for (const [name, flag] of Object.entries(command.flags ?? {})) {
        if (writtenFlags.has(name)) {
            continue;
        }

        if (flag.required) {
            fail(file, lineNumber, `${spoken(reference.id)} is missing required flag --${name}`);
        } else if (requireAllFlags && !flag.hidden && !GLOBAL_FLAGS.has(name)) {
            fail(file, lineNumber, `${spoken(reference.id)} does not document flag --${name}`);
        }
    }

    const requiredArguments = Object.values(command.args ?? {}).filter(argument => argument.required).length;
    const writtenArguments = [...reference.code.matchAll(/<[^>]+>/g)].length;

    if (writtenArguments < requiredArguments) {
        fail(
            file,
            lineNumber,
            `${spoken(reference.id)} documents ${writtenArguments} positional argument(s), manifest requires ${requiredArguments}`,
        );
    }
}

for (const file of INVENTORY_DOCS) {
    const lines = readFileSync(file, 'utf8').split('\n');

    for (const [index, line] of lines.entries()) {
        if (!line.startsWith('|')) {
            continue;
        }

        const row = cells(line);

        if (row.length < 3) {
            continue;
        }

        const reference = commandReference(row[0]);

        if (!reference) {
            continue;
        }

        const command = commands.get(reference.id);

        if (!command) {
            fail(file, index + 1, `documents unknown command ${spoken(reference.id)}`);
            continue;
        }

        if (documented.has(reference.id)) {
            fail(file, index + 1, `documents ${spoken(reference.id)} more than once`);
            continue;
        }

        documented.set(reference.id, { file, line: index + 1 });

        checkCommandRow(file, index + 1, reference, command, row[1], {
            requireAllFlags: FULL_FLAG_TOPICS.has(topicOf(reference.id)),
        });
    }
}

for (const id of commands.keys()) {
    if (!documented.has(id)) {
        fail(MANIFEST, 1, `${spoken(id)} is missing from the agent docs`);
    }
}

function checkExamples(file, line, lineNumber, topics = TOPICS) {
    const pattern = new RegExp(`\\badapty\\s+(?:${topics.join('|')})(?:\\s+[a-z][a-z-]*){1,2}`, 'g');

    for (const match of line.matchAll(pattern)) {
        const words = match[0].replace(/^adapty\s+/, '').split(/\s+/);
        let id = words.join(':');

        while (words.length > 2 && !commands.has(id)) {
            words.pop();
            id = words.join(':');
        }

        const command = commands.get(id);

        if (!command) {
            fail(file, lineNumber, `example uses unknown command ${match[0]}`);
            continue;
        }

        const example = line.slice(match.index);

        for (const flag of example.matchAll(/--([a-z][a-z0-9-]*)/g)) {
            if (!resolveFlag(command, flag[1])) {
                fail(file, lineNumber, `${spoken(id)} example uses unknown flag --${flag[1]}`);
            }
        }
    }
}

for (const file of EXAMPLE_DOCS) {
    const lines = readFileSync(file, 'utf8').split('\n');

    for (const [index, line] of lines.entries()) {
        checkExamples(file, line, index + 1);
    }
}

// The skill reference keeps its own two-column table style, so it is not an inventory doc. Its
// `attribution` section is checked on its own: every command listed, every written flag real.
const referenced = new Set();

for (const [index, line] of readFileSync(SKILL_REFERENCE, 'utf8').split('\n').entries()) {
    checkExamples(SKILL_REFERENCE, line, index + 1, ['attribution']);

    if (!line.startsWith('|')) {
        continue;
    }

    const row = cells(line);
    const reference = row.length < 2 ? null : commandReference(row[0]);

    if (!reference || topicOf(reference.id) !== 'attribution') {
        continue;
    }

    const command = commands.get(reference.id);

    if (!command) {
        fail(SKILL_REFERENCE, index + 1, `documents unknown command ${spoken(reference.id)}`);
        continue;
    }

    referenced.add(reference.id);
    checkCommandRow(SKILL_REFERENCE, index + 1, reference, command, row[1], { requireAllFlags: false });
}

for (const id of commands.keys()) {
    if (topicOf(id) === 'attribution' && !referenced.has(id)) {
        fail(SKILL_REFERENCE, 1, `${spoken(id)} is missing from the skill reference`);
    }
}

const setupText = normalizeNewlines(readFileSync(SETUP_DOC, 'utf8'));
const setupDescription = setupText.match(/^description:\s*(.+)$/m)?.[1] ?? '';

const setupContracts = [
    ['## Entry boundary', 'explicit setup entry boundary'],
    ['`NetworkError` means the CLI could not reach the API. Do not install or log in.', 'NetworkError routing'],
    ['failed to copy trust settings of system certificate-25291', 'Cowork certificate-noise signature'],
    ['NODE_USE_SYSTEM_CA=0', 'system CA fallback'],
    [
        'Adapty API is unreachable from this sandbox. Allow network access for `adapty.io` and',
        'concise network failure message',
    ],
];

for (const [contract, label] of setupContracts) {
    if (!setupText.includes(contract)) {
        fail(SETUP_DOC, 1, `missing setup contract: ${label}`);
    }
}

if (setupDescription.includes('402') || setupDescription.includes('ads_manager_subscription_required')) {
    fail(SETUP_DOC, 1, '402 must not trigger the setup skill');
}

if (setupText.indexOf('## Entry boundary') > setupText.indexOf('## Run this')) {
    fail(SETUP_DOC, 1, 'setup entry boundary must be read before install and login instructions');
}

const metricsText = normalizeNewlines(readFileSync(METRICS_DOC, 'utf8'));

const metricContracts = [
    ['`revenue`, `roas`, `arpu`, `arppu`, `arpas`, and\n  `roi`', 'complete cohort-window metric family'],
    ['Agent workflows use the `net_` variant', 'net revenue-family workflow default'],
    ['`cost_per_paid` and `cost_per_trial` are values for the requested date window', 'cost metric date-window semantics'],
    ['`--by-days` does not turn either into a day-X metric', 'non-cohort day-X prohibition'],
];

for (const [contract, label] of metricContracts) {
    if (!metricsText.includes(contract)) {
        fail(METRICS_DOC, 1, `missing metrics contract: ${label}`);
    }
}

const attributionText = normalizeNewlines(readFileSync(ATTRIBUTION_DOC, 'utf8'));

const attributionContracts = [
    ['`null` means the value cannot be computed — never zero', 'null meaning'],
    ['Campaign, ad set, and ad filters take ids, never names.', 'id-filter rule'],
    ['\n## Crosswalk with `asa metrics`\n', 'crosswalk heading'],
    ['`attribution metrics` also returns these caps as numbers in `data.limits`', 'catalog limits'],
];

for (const [contract, label] of attributionContracts) {
    if (!attributionText.includes(contract)) {
        fail(ATTRIBUTION_DOC, 1, `missing attribution contract: ${label}`);
    }
}

if (errors.length > 0) {
    for (const error of errors) {
        console.error(`ERROR ${error}`);
    }

    console.error(`\n${errors.length} agent documentation drift error(s)`);
    process.exit(1);
}

const countTopic = topic => [...commands.keys()].filter(id => topicOf(id) === topic).length;

console.log(
    `Agent docs match ${countTopic('asa')} executable Apple Ads commands and ${countTopic('attribution')} attribution commands in oclif.manifest.json.`,
);
