import type {
    FontConflict,
    FontFace,
    FontFamily,
    FontFamilyUsage,
    FontUploadResult,
    FontUploadResultKind,
    FontWarning,
} from '../../sdk/adapty/index.js';
import type { FontFileReport, FontPackageReport } from '../base/adapty/index.js';

/**
 * The custom fonts as text. A family is a header line and a table of its faces; `--json` has every
 * field of the server. A change of a family some flow uses ends with those flows and the publish they need.
 */

const NONE = '—';

/** Every column left-aligned: the cells are ids and names, not numbers to compare. */
const leftTable = (rows: readonly string[][]): string => {
    const widths = (rows[0] ?? []).map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0)));

    return rows.map(row => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()).join('\n');
};

/** `400`, `700 italic`; a face whose pair is not known says so. */
export const faceLabel = (face: Pick<FontFace, 'italic' | 'weight'>): string => {
    if (face.weight === null) {
        return 'weight unknown';
    }

    return face.italic === true ? `${face.weight} italic` : String(face.weight);
};

const FACE_HEADER = ['Face ID', 'Face', 'iOS name', 'Android name', 'Status', 'Format', 'Default'];

const faceRow = (face: FontFace): string[] => [
    face.id,
    faceLabel(face),
    face.font_alias_ios ?? NONE,
    face.font_alias_android ?? NONE,
    face.metadata_status,
    face.file_format ?? NONE,
    face.is_default ? 'default' : '',
];

export const renderFamily = (family: FontFamily): string =>
    [`${family.name} (${family.id})`, leftTable([FACE_HEADER, ...family.faces.map(face => faceRow(face))])].join('\n');

export const renderFamilyList = (families: readonly FontFamily[], appId: string): string => (families.length === 0
    ? `No custom fonts in this app. Upload one with \`adapty fonts upload --app ${appId} FILE\`.`
    : families.map(family => renderFamily(family)).join('\n\n'));

const usageLines = (title: string, rows: readonly string[]): string[] =>
    (rows.length === 0 ? [`${title}: none`] : [`${title}:`, ...rows.map(row => `  ${row}`)]);

export const renderUsage = (usage: FontFamilyUsage): string => [
    ...usageLines('Flows (drafts too)', usage.flows.map(flow => `${flow.flow_id}  ${flow.found_count} uses`)),
    ...usageLines('Paywalls', usage.paywalls.map(paywall => `${paywall.paywall_id}  ${paywall.found_count} uses`)),
    ...usageLines('Paywalls per face', usage.faces.map(face => `${face.face_id}  ${face.paywalls === null
        ? 'unknown'
        : face.paywalls.map(paywall => paywall.paywall_id).join(', ') || 'none'}`)),
].join('\n');

export const renderWarnings = (warnings: readonly FontWarning[]): string[] =>
    warnings.map(warning => `Warning: ${warning.message} (face ${warning.face_id})`);

/** Empty when no flow uses the family; `null` was already a warning. */
export const renderFlowsToPublish = (flowIds: null | readonly string[], appId: string): string[] => {
    if (flowIds === null || flowIds.length === 0) {
        return [];
    }

    return [
        'These flows use the changed font and need a publish to get it:',
        ...flowIds.map(flowId => `  ${flowId}`),
        `Run \`adapty flows publish --app ${appId} FLOW_ID\` for each.`,
    ];
};

const facesOf = (title: string, faces: readonly FontFace[]): string[] =>
    (faces.length === 0 ? [] : [`${title} ${faces.map(face => faceLabel(face)).join(', ')}`]);

const RESULT_WORDS: Readonly<Record<FontUploadResultKind, string>> = {
    added: 'added',
    created: 'created',
    kept: 'kept (file skipped)',
    partly_added: 'partly added',
    replaced: 'replaced',
};

const storedLines = (report: FontUploadResult & { file: string }): string[] => {
    const family = report.family === null ? '' : ` in ${report.family.name} (${report.family.id})`;

    const parts = [
        ...facesOf('new faces', report.created_faces),
        ...facesOf('replaced faces', report.replaced_faces),
        ...facesOf('kept faces', report.kept_faces),
    ];

    return [
        `${report.file}: ${RESULT_WORDS[report.result]}${family}${parts.length > 0 ? `: ${parts.join('; ')}` : ''}`,
        ...renderWarnings(report.warnings).map(line => `  ${line}`),
    ];
};

const conflictLabel = (conflict: FontConflict): string =>
    `face ${conflict.face_id} (${faceLabel(conflict)}, iOS name ${conflict.font_alias_ios ?? NONE}) of ${conflict.family_name}`;

const reportLines = (report: FontFileReport): string[] => {
    if (report.result === 'failed') {
        return [`${report.file}: failed — ${report.message}`];
    }

    if (report.result === 'not_sent') {
        return [`${report.file}: not sent`];
    }

    if (report.result === 'refused') {
        const next = report.next_step === undefined ? [] : [`  ${report.next_step}`];
        const collisions = (report.conflicts ?? []).map(conflict => `  collides with ${conflictLabel(conflict)}`);

        return [`${report.file}: refused — ${report.error_code}: ${report.message}`, ...collisions, ...next];
    }

    return storedLines(report);
};

export const renderPackage = (report: FontPackageReport, appId: string): string => {
    const refused = report.files.filter(file => file.result === 'refused').length;
    const stored = report.files.filter(file => 'family' in file).length;

    return [
        ...report.files.flatMap(file => reportLines(file)),
        '',
        `${stored} of ${report.files.length} files done${refused > 0 ? `, ${refused} refused` : ''}.`,
        ...renderFlowsToPublish(report.flows_to_publish, appId),
    ].join('\n');
};

/** A family after a change: the family, its warnings, and the flows that need a publish. */
export const renderChangedFamily = (
    family: FontFamily & { warnings?: FontWarning[] },
    flowIds: null | readonly string[],
    appId: string,
): string => [renderFamily(family), ...renderWarnings(family.warnings ?? []), ...renderFlowsToPublish(flowIds, appId)].join('\n');
