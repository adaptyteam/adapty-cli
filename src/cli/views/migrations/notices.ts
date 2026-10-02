/**
 * ADAPTY_MIGRATION outlives both a save and a clear, so "saved" or "cleared" alone would be a lie.
 * Commands write these to stderr rather than through `warn()`, which oclif silences under --json:
 * a selection that is not in effect is exactly what a script has to be told about.
 */
export const envOverridesSelection
    = 'Warning: ADAPTY_MIGRATION still overrides the saved selection. Unset it in your shell to use this ID.\n';

export const envSuppliesMigration
    = 'Warning: ADAPTY_MIGRATION still supplies a migration ID. Unset it in your shell.\n';
