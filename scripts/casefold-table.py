"""Writes src/sdk/adapty/fonts/casefold-table.ts: every code point that Python 3.12's str.casefold changes.

The server matches flow font names with Python's str.casefold, so the CLI carries the same table instead
of the case rules of the JavaScript runtime. The output depends only on the Unicode data of Python 3.12.

    python3.12 scripts/casefold-table.py           # write the table
    python3.12 scripts/casefold-table.py --check   # exit 1 when the checked-in table differs
"""

import pathlib
import sys
import unicodedata

PYTHON = (3, 12)
UNICODE = '15.0.0'
WIDTH = 110
TABLE = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'sdk' / 'adapty' / 'fonts' / 'casefold-table.ts'

HEADER = """/**
 * Every code point that Python 3.12's `str.casefold` changes, the case folding of the server's name match:
 * `<code point>:<code point>[.<code point>...]`, base 36, separated by spaces. Generated from Python 3.12
 * over all code points; a code point that is not here folds to itself. It does not depend on the runtime.
 * Written by `python3.12 scripts/casefold-table.py`; do not edit by hand.
 */
export const CASEFOLD = [
"""

DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def base36(number: int) -> str:
    text = ''

    while True:
        number, rest = divmod(number, 36)
        text = DIGITS[rest] + text

        if number == 0:
            return text


def items() -> list[str]:
    found = []

    for code_point in range(sys.maxunicode + 1):
        char = chr(code_point)
        folded = char.casefold()

        if folded != char:
            found.append(f"{base36(code_point)}:{'.'.join(base36(ord(part)) for part in folded)}")

    return found


def lines(parts: list[str]) -> list[str]:
    """Greedy: as many items on a line as fit in WIDTH with the indent, the quotes and the comma."""
    result: list[str] = []
    current: list[str] = []

    for part in parts:
        if current and len("    '" + ' '.join([*current, part]) + "',") > WIDTH:
            result.append("    '" + ' '.join(current) + "',")
            current = []

        current.append(part)

    if current:
        result.append("    '" + ' '.join(current) + "',")

    return result


def table() -> str:
    return HEADER + '\n'.join(lines(items())) + "\n].join(' ');\n"


def main() -> int:
    if sys.version_info[:2] != PYTHON or unicodedata.unidata_version != UNICODE:
        print(f'Run with Python {PYTHON[0]}.{PYTHON[1]} (Unicode {UNICODE}), the case folding of the server.', file=sys.stderr)
        return 2

    contents = table().encode('utf-8')

    if sys.argv[1:] == ['--check']:
        if TABLE.read_bytes() != contents:
            print(f'{TABLE} differs from the generated table: run python3.12 scripts/casefold-table.py', file=sys.stderr)
            return 1

        return 0

    TABLE.write_bytes(contents)
    return 0


if __name__ == '__main__':
    sys.exit(main())
