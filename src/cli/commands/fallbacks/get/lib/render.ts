/** The part of the --output summary the human line shows. */
type WrittenLine = {
    bytes: number;
    path: string;
    platform: string;
};

/** One line: the file is on disk, so the human view only says where it went and how big it is. */
export const renderWritten = (written: WrittenLine): string =>
    `Wrote ${written.platform} fallback to ${written.path} (${written.bytes} bytes)`;
