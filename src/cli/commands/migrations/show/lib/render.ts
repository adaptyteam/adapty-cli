import type { Envelope, ResourceRef } from '../../../../../sdk/adapty/index.js';

const maxWidth = (values: readonly string[]): number => {
    return values.reduce((max, value) => Math.max(max, value.length), 0);
};

const resourceLine = (resource: ResourceRef, width: number): string => {
    return `  ${resource.name.padEnd(width)}  ${resource.title}`;
};

export const renderResources = (envelope: Envelope): string => {
    const { resources } = envelope;
    const [first] = resources;

    if (first === undefined) {
        return `Nothing to read yet: ${envelope.migration.summary}`;
    }

    const width = maxWidth(resources.map(resource => resource.name));

    return [
        'Readable now:',
        ...resources.map(resource => resourceLine(resource, width)),
        '',
        `Read one: \`adapty migrations show ${first.name} -m ${envelope.migration.id}\``,
    ].join('\n');
};

/** Use JSON because resource shapes vary by flow. */
export const renderResult = (envelope: Envelope): string => {
    if (envelope.result === null) {
        return `No data in this resource yet: ${envelope.migration.summary}`;
    }

    return JSON.stringify(envelope.result, null, 2);
};
