---
title: "feat: persistent currentMigrationId in the CLI"
type: feat
status: planned
date: 2026-09-16
---

# Persistent current migration

Add a saved migration selection so a person can choose a migration once and continue after
restarting the terminal. Keep explicit IDs available for scripts and concurrent work. The local
selection is a CLI convenience; migration state and allowed actions remain owned by the server.

This plan describes implementation to be done, not functionality already present.

## Current implementation

- The published topic is `adapty migrations` (plural). Keep that spelling.
- `src/cli/input/migration.ts` requires `--migration` / `-m`, with `ADAPTY_MIGRATION` as an alternative.
- `status`, `show`, `steps`, `run` and `close` pass the parsed ID directly to the SDK.
- `create` returns an envelope and prints a continuation command with `-m`; it saves no selection.
- `src/sdk/core/session.ts` stores only credentials in `config.json`. Saving rewrites that file;
  clearing removes it. Both CLI stacks depend on that format.
- `auth logout` clears the stored session; `auth revoke` clears it only after successful revocation
  of a matching token. `ADAPTY_TOKEN` may override a different stored session.
- Session users currently have `email` and `name`, but no typed, stable account/company ID.

## User-facing behavior

```sh
adapty migrations list
adapty migrations use mig_abc123
adapty migrations current
adapty migrations status
adapty migrations show report
adapty migrations status -m mig_other
adapty migrations unuse
```

### `migrations use <id>`

1. Parse a required, non-empty ID argument and require authentication.
2. Call `migrations.get(id)` with the effective token and API URL to verify access.
3. Save the returned `migration.id` with the scope described below, replacing the previous selection.
4. Print the selected ID only after persistence succeeds.

The command neither starts nor modifies a migration. Completed, canceled and failed migrations
can be selected for inspection. A failed GET or local write preserves the previous selection.
There is no extra confirmation prompt. The argument is the selection to save even when
`ADAPTY_MIGRATION` is set; warn on stderr that the environment variable still overrides it.

JSON result: `{ "currentMigrationId": "mig_abc123" }`.

### `migrations current`

Show the ID that commands without `-m` would use, with its source: `ADAPTY_MIGRATION` or the saved
context. This is a local read, with no GET, token validation request or write. An expired token
therefore does not prevent inspecting its saved selection. The command does not accept `-m`.

JSON result: `{ "currentMigrationId": "mig_abc123", "source": "context" }`, where source is
`"env"`, `"context"` or `null`. With no applicable selection, return
`{ "currentMigrationId": null, "source": null }`, print an instruction to run `migrations use <id>`,
and exit 0. Without an effective token, a stored selection is inapplicable; an explicit environment
ID can still be displayed. Never expose the token or its fingerprint in command output.

### `migrations unuse`

Remove the saved selection, without authentication or network access. This is idempotent and
works even if the context is malformed or belongs to a different scope. It does not change the
parent shell environment: if `ADAPTY_MIGRATION` is set, explain that it still supplies an ID and
must be unset in the shell. Return `{ "currentMigrationId": null }`; this describes saved state,
not the effective environment override.

### `migrations create`

After successful creation, save the returned ID as current, including with `--json` and in a pipe.
Add `--no-select` to opt out for scripts and concurrent workflows. Do not make persistence depend
on whether a terminal is attached. A failed API request never changes the saved selection.

Keep the existing envelope as the JSON result. If creation succeeds but saving context fails,
return the successful envelope and warn on stderr with the created ID and the explicit `-m`
continuation command. Do not turn this into an apparent failed creation that invites a duplicate
POST. Do not retry creation to repair a local write failure. Also explain an active
`ADAPTY_MIGRATION` override when saving succeeds.

## Resolving an ID

Use one shared resolver for `status`, `show`, `steps`, `run` and `close`:

1. Explicit `--migration` / `-m`.
2. Non-empty `ADAPTY_MIGRATION`.
3. `currentMigrationId` from a context matching the effective session scope.
4. Usage error (exit 2, code `migration_required`) with instructions for `use`, `list` and `-m`.

Remove `required: true` from the shared flag. Resolve the environment in the CLI resolver instead
of relying on the flag's `env` fallback, so the source remains explicit and `current` can reuse
exactly the same rules. Inject the environment value into the resolution logic for tests; never
read environment variables in the SDK. Update flag help to advertise all three sources.

An empty environment value counts as absent; explicitly empty or whitespace-only IDs are usage
errors, not permission to fall through to a different migration. Do not invent a Salesforce-like
ID length/prefix restriction for opaque migration IDs.

Read the context lazily: explicit flag/env IDs must work even if `context.json` is corrupted or
unreadable. They do not update the saved selection. Never guess an ID from `migrations list`.
Keep parsing and command-specific input validation before resolution and network requests.
When both an ID and credentials are absent, keep the actionable missing-ID usage error; when an
ID is supplied but credentials are absent, keep the existing auth error.

Resolve once per command invocation. In particular, `run` and `close` must use the same captured
ID for the initial GET and subsequent POST, and `status --wait` must keep that ID for every poll.
A `use` in another terminal must not redirect an operation that has already resolved its target.

Before a `run` or `close` mutation using saved context, identify the target ID on stderr. Existing
`--yes`, revision checks and error handling stay in force. Existing migration JSON envelopes and
exit codes remain unchanged apart from the new local context errors described below.

## Storage and scope

Keep credentials in the existing `config.json`. Put the selection in `context.json` beside it,
using oclif's `config.configDir`; do not hardcode a home path or introduce project-directory lookup.
Do not add `currentMigrationId` to SDK `Session` or `SessionStore`.

One saved selection is sufficient for this version:

```ts
type MigrationContext = {
    version: 1;
    apiUrl: string;
    tokenFingerprint: string;
    currentMigrationId: string;
};
```

Scope by normalized effective API base URL plus SHA-256 of the effective token. Normalize the URL
consistently with the SDK's base URL handling; retain the base path and distinguish environments.
Never write the raw token into the context. A fingerprint is only a local matching key, not proof
of authorization; the server still authorizes every operation.

This deliberately conservative scope uses the identity information available today. Do not infer
account identity from email or decode an opaque token. A different token, including a different
`ADAPTY_TOKEN`, cannot silently inherit the saved selection. If the environment contains exactly
the stored token, it is the same scope regardless of its source.

A scope mismatch makes the saved selection inapplicable, without deleting or overwriting it on a
read. Returning to the same token/API URL makes it available again. `use` or selecting a newly
created migration explicitly replaces the single record. An app ID is not part of the scope: a
new catalog migration can have `app: null`, and the migration ID already identifies the target.

**First-version limitation:** issuing a new token requires selecting the migration again, even
for the same human account. Preserving selection across reauthentication requires a documented,
stable server account/company identity; it is deferred rather than guessed from the current
`email`/`name` fields. Multiple saved profiles are also outside this change.

Implement the file store in the CLI layer, with the directory passed in. Requirements:

- Missing file means no selection. Malformed JSON, invalid shape, unsupported version and I/O
  failures are distinct from absence; report a context-specific error with the path and recovery
  through `migrations unuse` / `migrations use <id>`.
- Use `CliError` with exit 1 and a stable `migration_context_invalid` or
  `migration_context_io` code. Do not reuse the SDK storage mapper that tells users to log in.
- Write through a uniquely named temporary file in the same directory, then rename atomically.
  Use mode 0600 for the file and private directory permissions on creation; clean up temporary
  files after failures. A failed replacement must leave the previous valid file intact.
- `use` can replace malformed context without first reading it; `unuse` can remove it directly.
- Simultaneous selections are last-successful-write-wins; readers never see partial JSON.
  Document that the selection is shared across terminals. Scripts should use `-m` or an
  environment ID, and `create --no-select` when they must not change the shared default.

## Selection lifecycle and authentication

| Event | Context behavior |
| --- | --- |
| Terminal closes or a CLI process exits | Preserve |
| Successful `use <id>` | Replace after GET validation |
| Successful `create`, without `--no-select` | Replace with the created ID |
| Explicit `-m` or `ADAPTY_MIGRATION` for an operation | Override for this invocation; do not save |
| `unuse` | Remove saved context, even without a session |
| `completed`, `canceled`, `failed`, or successful `close` | Preserve for status/report inspection |
| Network failure, 401, 403, or 404 | Preserve; do not infer permanent deletion |
| Different effective token or API URL | Ignore mismatching context; do not mutate on read |
| Successful login with a new token | Old context cannot match; require a new selection |
| `auth logout` | Clear stored credentials and the local context, including orphaned context |
| Successful `auth revoke` | Clear context only if its fingerprint matches the revoked token |
| Failed/canceled login or failed revoke | Preserve context |

`logout` clears context even if `session.store.load()` finds no stored session. Attempt both local
cleanup operations if either fails, and report partial cleanup as a local error. Preserve the
existing warning that a parent-shell `ADAPTY_TOKEN` remains set; likewise, CLI commands cannot
unset `ADAPTY_MIGRATION` in that shell.

`revoke` remains server-first. After server success, keep the existing matching-token rule for
removing `config.json`, and independently remove context belonging to the revoked token. A
revoked environment token must not clear context belonging to a different stored token. Because
this is one saved record, cleanup can compare fingerprints without assuming that the current API
URL was the URL at selection time. If local cleanup fails, make clear that revocation succeeded;
do not automatically repeat the server operation.

`login` continues saving only credentials. The scope check makes old context inactive after a
token change, so login need not rewrite a second file or clear another token's selection. The
context remains recoverable with `unuse` or replaceable with `use`. Logging out removes it
explicitly. Existing auth JSON result shapes remain unchanged on success.

There is no migration-deletion command in scope and no automatic cleanup on a generic 404. If a
future command permanently deletes a migration, clear context only after confirmed success and
only when the saved ID and scope match the deleted migration.

## Implementation sequence

1. **CLI context store and resolver.** Add `src/cli/context/migration.ts` for the record, scope,
   file operations and shared resolution. Keep the module small; split only if implementation
   size justifies it. Keep flag/argument declarations in `src/cli/input/migration.ts`. Expose the
   already resolved session to the resolver without adding migration policy to `BaseCommand` or
   the SDK; if needed, provide a protected non-auth-enforcing session accessor in `AdaptyCommand`
   while preserving its existing authenticated accessor.
2. **Selection commands.** Add `use`, `current` and `unuse` under `src/cli/commands/migrations`.
   Simple commands can be single files; directory commands use `command.ts` plus an `index.ts`
   re-export. Add only discovery re-exports under `src/commands/migrations`. `use` requires an
   authenticated session; `current` and `unuse` extend `BaseCommand` and do local work.
3. **Existing commands.** Integrate the resolver into `status`, `show`, `steps`, `run` and `close`.
   Pass the captured ID through the run command's helpers instead of reading an optional flag
   again. Integrate selection into `create` and add `--no-select`. Preserve envelope output,
   action confirmation, optimistic concurrency and polling behavior.
4. **Auth cleanup.** Extend CLI `logout` and `revoke` orchestration, keeping SDK credential storage
   and legacy compatibility unchanged. Cover the env-token override cases explicitly.
5. **Documentation.** Update README migration usage, command help/examples, the migration inventory
   in `CLAUDE.md`, and `skills/adapty-cli/references/cli-commands.md`. Update any stateless/explicit-ID
   claims in `skills/adapty-cli/SKILL.md`. Describe CLI context ownership in `docs/architecture.md`.
   Keep this plan as planned until the implementation and checks are complete.

No new endpoint, SDK resource method, third-party dependency, singular topic alias, interactive
selection menu, automatic retry, migration upload or migration-state change is required.

## Verification

Use isolated temporary config directories and scripted HTTP responses. Update
`test/helpers/isolate-config.ts` to clean both files and reset `ADAPTY_MIGRATION` as well as auth
environment values between tests. Restore any environment values changed by individual tests.

- Store: absent/valid/malformed/version-mismatched context, permission/I/O errors, replacement
  failure preserving the old record, idempotent removal, and scope comparison for API URL/token.
- Resolution: flag > env > matching context; empty and invalid inputs; mismatch; no selection;
  malformed context bypassed by an explicit ID; no unexpected GET/list calls.
- Commands: `use` verifies before saving and preserves selection on failure; `current` reports
  the effective source without requests; `unuse` works offline and explains env overrides.
- Persistence: select in one process, read/use in a fresh process with the same config directory.
- Operations: all five existing target commands use the resolved ID; changing context between
  GET and POST or during polling does not change the in-flight target.
- Creation: default selection, `--no-select`, unchanged JSON envelope, and successful server
  creation plus failed local persistence produces a warning without a second POST.
- Lifecycle: closed/failed migrations remain inspectable; network/auth/404 errors preserve the
  file; logout removes orphaned context; revoke handles matching and different env tokens;
  failed revoke preserves both files; reauthentication cannot reuse another token's selection.
- CLI compatibility: retain flag/env behavior, JSON envelopes and confirmation/exit semantics.
  Update the subprocess missing-ID test in `test/commands/migrations-exit-codes.test.ts` to expect
  the resolver's exit-2 error instead of oclif's former required-flag wording. Verify local context
  errors in both human and JSON modes without leaking fingerprints or tokens.
- Run `pnpm build`, `pnpm test` (includes lint) and `pnpm check:agent-docs` after implementation.
  Keep frozen-legacy, command-layout and SDK/CLI import-boundary checks intact.

## Done when

A user can create or select a migration, reopen the terminal and run `migrations status` without
remembering the ID. `current` explains the effective selection, explicit flag/env IDs remain
predictable, account/environment changes cannot silently reuse it, and logout/revoke perform
only the intended cleanup. Credentials keep their existing format and the SDK remains unaware
of the CLI's saved selection.
