/** Joins the 80-column wrap of piped help and errors, with the `›` gutter, into one line. */
export const unwrap = (text: string): string => text.replaceAll(/\s*[›»]\s*/g, ' ').replaceAll(/\s+/g, ' ');
