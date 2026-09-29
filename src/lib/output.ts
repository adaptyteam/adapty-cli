const UPPER_WORDS = new Set(['api', 'id', 'ios', 'sdk', 'uri', 'url', 'uuid']);

/**
 * Nesting depth past which a subtree is printed as one JSON line instead of being walked.
 * The walk is recursive, so a pathological payload (a ~5000-level flow config) would otherwise
 * blow the call stack; nothing the CLI prints for humans is legitimately this deep.
 */
const MAX_DEPTH = 50;

/** Longest single-line JSON fallback; anything longer is cut with an ellipsis. */
const MAX_FALLBACK_LENGTH = 200;

function formatLabel(snakeKey: string): string {
    return snakeKey
        .split('_')
        .map((w) => {
            if (w === 'ids') {
                return 'IDs';
            }

            if (UPPER_WORDS.has(w)) {
                return w.toUpperCase();
            }

            return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(' ');
}

function isScalar(value: unknown): boolean {
    return typeof value !== 'object' || value === null;
}

// Never `push(...items)`: a spread passes every element as an argument, and V8 throws
// "Maximum call stack size exceeded" once a subtree renders to ~100k lines.
function append(target: string[], items: string[]): void {
    for (const item of items) {
        target.push(item);
    }
}

function truncatedJson(value: unknown): string {
    let json: string;

    try {
        json = JSON.stringify(value);
    } catch {
        // JSON.stringify recurses too: a subtree nested ~10k levels deep overflows it as well.
        return '[nested too deep to print]';
    }

    return json.length > MAX_FALLBACK_LENGTH ? `${json.slice(0, MAX_FALLBACK_LENGTH)}…` : json;
}

function renderArrayItems(items: unknown[], indent: string, depth: number): string[] {
    const childIndent = indent + '  ';
    const lines: string[] = [];

    for (const item of items) {
        if (item === undefined || item === null) {
            continue;
        }

        if (isScalar(item)) {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string -- FIXME if you see this
            lines.push(`${indent}- ${String(item)}`);
        } else if (depth >= MAX_DEPTH) {
            lines.push(`${indent}- ${truncatedJson(item)}`);
        } else if (Array.isArray(item)) {
            append(lines, renderArrayItems(item, childIndent, depth + 1));
        } else {
            const nested = renderObject(item as Record<string, unknown>, childIndent, depth + 1);
            const head = nested[0];

            if (head === undefined) {
                continue;
            }

            lines.push(`${indent}- ${head.slice(childIndent.length)}`);
            append(lines, nested.slice(1));
        }
    }

    return lines;
}

function renderObject(data: Record<string, unknown>, indent: string, depth: number): string[] {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) {
            continue;
        }

        const label = `${indent}${formatLabel(key)}:`;

        if (isScalar(value)) {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string -- FIXME if you see this
            lines.push(`${label} ${String(value)}`);
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                continue;
            }

            if (value.every(v => isScalar(v))) {
                lines.push(`${label} ${value.map(String).join(', ')}`);
            } else if (depth >= MAX_DEPTH) {
                lines.push(`${label} ${truncatedJson(value)}`);
            } else {
                lines.push(label);
                append(lines, renderArrayItems(value, indent + '  ', depth + 1));
            }
        } else if (depth >= MAX_DEPTH) {
            lines.push(`${label} ${truncatedJson(value)}`);
        } else {
            const nested = renderObject(value as Record<string, unknown>, indent + '  ', depth + 1);

            if (nested.length > 0) {
                lines.push(label);
                append(lines, nested);
            }
        }
    }

    return lines;
}

export function printResponse(data: Record<string, unknown>, log: (msg: string) => void): void {
    for (const line of renderObject(data, '', 0)) {
        log(line);
    }
}

export function printList(
    items: Record<string, unknown>[],
    log: (msg: string) => void,
    pagination?: { count: number; page: number; pages: number },
): void {
    for (const [i, item] of items.entries()) {
        printResponse(item, log);

        if (i < items.length - 1) {
            log('---');
        }
    }

    if (pagination) {
        log('');
        log(`Page ${pagination.page} of ${pagination.pages} (${pagination.count} total)`);
    }
}
