# Contributing

## Versioning

A new `version` in `package.json` on `main` is a release: CI tags `vX.Y.Z`, publishes the GitHub release and
the npm package, and regenerates the README. Until 1.0:

1. Bump the version only in a dedicated PR with the single commit `chore: bump version to X.Y.Z`. Edit
   `version` by hand; `npm version` makes its own commit and tag. Feature and fix PRs never touch `version`.
2. Bump minor (`0.Y.0`) if anything since the last tag adds to or breaks what users and scripts rely on:
   commands, flags, defaults, `--json` output, exit codes, env vars.
3. Bump patch (`0.Y.Z`) for everything else: fixes, docs, refactors.
4. Before opening the bump PR, check what it releases:
   `git log --oneline $(git describe --tags --abbrev=0 origin/main)..origin/main`.
