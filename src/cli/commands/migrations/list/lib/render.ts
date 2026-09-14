import type { AvailableFlow, Migration, MigrationList } from '../../../../../sdk/adapty/index.js';

type App = Migration['app'];

/** One block per Adapty App: its migrations, then the optional flows WS says can start for it. */
type Group = {
    app: App;
    available: AvailableFlow[];
    migrations: Migration[];
};

const stateOrder = [
    'action_required',
    'running',
    'failed',
    'completed',
    'canceled',
] as const satisfies readonly Migration['state'][];

const stateRank = (state: string): number => {
    const index = stateOrder.findIndex(knownState => knownState === state);

    return index === -1 ? stateOrder.length : index;
};

const appLabel = (app: App): string => (app === null ? 'App not created yet' : `${app.name} (${app.id})`);

const maxWidth = (values: readonly string[]): number => {
    return values.reduce((max, value) => Math.max(max, value.length), 0);
};

const groupByApp = (list: MigrationList): Group[] => {
    const groups = new Map<string | null, Group>();

    const groupFor = (app: App): Group => {
        const key = app === null ? null : app.id;
        const existing = groups.get(key);

        if (existing !== undefined) {
            return existing;
        }

        const group: Group = { app, available: [], migrations: [] };

        groups.set(key, group);

        return group;
    };

    for (const migration of list.items) {
        groupFor(migration.app).migrations.push(migration);
    }

    for (const flow of list.available) {
        groupFor(flow.app).available.push(flow);
    }

    return [...groups.values()];
};

const renderMigrations = (migrations: readonly Migration[]): string[] => {
    const sorted = [...migrations].sort((a, b) => stateRank(a.state) - stateRank(b.state));
    const idWidth = maxWidth(sorted.map(migration => migration.id));
    const flowWidth = maxWidth(sorted.map(migration => migration.flow));
    const lines: string[] = [];
    let heading: string | undefined;

    for (const migration of sorted) {
        if (migration.state !== heading) {
            heading = migration.state;
            lines.push(`  ${heading}`);
        }

        const id = migration.id.padEnd(idWidth);
        const flow = migration.flow.padEnd(flowWidth);

        lines.push(`    ${id}  ${flow}  ${migration.updated_at}  ${migration.summary}`);
    }

    return lines;
};

const renderAvailable = (available: readonly AvailableFlow[]): string[] => {
    if (available.length === 0) {
        return [];
    }

    const flowWidth = maxWidth(available.map(flow => flow.flow));

    return [
        '  Available to start:',
        ...available.map((flow) => {
            const detail = flow.detail === null ? '' : `  ${flow.detail}`;

            return `    ${flow.flow.padEnd(flowWidth)}  ${flow.title}${detail}`;
        }),
    ];
};

const renderGroup = (group: Group): string => [
    appLabel(group.app),
    ...renderMigrations(group.migrations),
    ...renderAvailable(group.available),
].join('\n');

/** Grouped by app and, inside an app, by state. */
export const renderMigrationList = (list: MigrationList): string => {
    if (list.items.length === 0 && list.available.length === 0) {
        return 'No migrations yet. Start one: `adapty migration create --name <app name>`';
    }

    return groupByApp(list).map(group => renderGroup(group)).join('\n\n');
};
