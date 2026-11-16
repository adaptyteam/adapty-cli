const QUOTE = 0x22;
const BACKSLASH = 0x5C;
const OPEN_BRACE = 0x7B;
const CLOSE_BRACE = 0x7D;
const OPEN_BRACKET = 0x5B;
const CLOSE_BRACKET = 0x5D;

/** JSON's own whitespace: space, tab, line feed, carriage return. */
const isWhitespace = (byte: number): boolean => byte === 0x20 || byte === 0x09 || byte === 0x0A || byte === 0x0D;

type State = {
    /** The top-level object has closed: only whitespace may follow. */
    closed: boolean;
    depth: number;
    /** The previous byte in a string was a backslash, so this one is escaped. */
    escaped: boolean;
    inString: boolean;
    started: boolean;
};

/** One byte outside a string, after the first `{`; a reason when the body cannot be the file. */
const structural = (state: State, byte: number): string | undefined => {
    if (byte === QUOTE) {
        state.inString = true;
    } else if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
        state.depth += 1;
    } else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
        state.depth -= 1;

        if (state.depth === 0) {
            state.closed = true;

            return byte === CLOSE_BRACE ? undefined : 'the top-level object ends with ]';
        }
    }

    return undefined;
};

const inString = (state: State, byte: number): void => {
    if (state.escaped) {
        state.escaped = false;
    } else if (byte === BACKSLASH) {
        state.escaped = true;
    } else if (byte === QUOTE) {
        state.inString = false;
    }
};

const step = (state: State, byte: number): string | undefined => {
    if (state.inString) {
        inString(state, byte);

        return undefined;
    }

    if (state.closed || !state.started) {
        if (isWhitespace(byte)) {
            return undefined;
        }

        if (state.closed) {
            return 'the body has more after the closing }';
        }

        if (byte !== OPEN_BRACE) {
            return 'the body does not start with {';
        }

        state.started = true;
        state.depth = 1;

        return undefined;
    }

    return structural(state, byte);
};

/**
 * Checks that a body is one whole JSON object without parsing it or holding it: the bytes go through
 * `push` as they arrive, and only the nesting depth and whether a string is open are kept. Brackets
 * inside strings do not count; a backslash escapes the next byte, across chunk borders too. The body
 * is whole when its first non-whitespace byte is `{`, the depth comes back to 0 on a `}`, and only
 * whitespace follows. It does not prove the JSON valid: that is the SDK's job, and a parse here would
 * cost the whole body in memory.
 */
export const createDepthScanner = () => {
    const state: State = { closed: false, depth: 0, escaped: false, inString: false, started: false };

    return {
        /** The reason the body cannot be the file, as soon as `chunk` shows it; else undefined. */
        push(chunk: Uint8Array): string | undefined {
            for (const byte of chunk) {
                const reason = step(state, byte);

                if (reason !== undefined) {
                    return reason;
                }
            }

            return undefined;
        },
        /** Whether the first `{` has been seen: until then a caller may hold the leading whitespace back. */
        get started(): boolean {
            return state.started;
        },
        /** At the end of the body: the reason it is not one whole object, or undefined. */
        end(): string | undefined {
            if (!state.started) {
                return 'the body is empty';
            }

            return state.closed ? undefined : 'the body ends before its closing }';
        },
    };
};
