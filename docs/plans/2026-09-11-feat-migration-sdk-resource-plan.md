---
title: "feat: migrations resource in sdk/adapty (PR 1 of the migration topic)"
type: feat
status: planned
date: 2026-09-11
contract: https://app.notion.com/p/CLI-Wizard-Service-3d51ca4355c3812c9fa3e2f2f8a30f3c
---

# Migrations resource in `sdk/adapty`

First step towards `adapty migration …`. Read-only, sdk only, no command yet. The CLI is a thin
client of the Wizard Service (WS): the whole flow lives on the server and every answer has one
shape, the envelope. This PR teaches the sdk that shape and the three GET endpoints.

## Scope

In:

- contract types from section 5 of the doc
- `list()`, `get(id)`, `resource(id, name)`
- `migrations` hung off `createAdapty`, on the same transport and token as `apps`
- the developer error parser reads the WS error body

Out (each is its own PR): any command, `--wait`, `create`, `run`, `close`, uploads, docs.

## Files

```
src/sdk/adapty/migrations/
├── index.ts      # the door: re-exports only
├── model.ts      # Envelope, Migration, Step, Issue, Action, ResourceRef, MigrationList
└── resource.ts   # list / get / resource — the endpoint map
```

- `src/sdk/adapty/index.ts` — `migrations: migrations(http)` in `Adapty`, types re-exported.
- `src/sdk/adapty/errors.ts` — `developerErrorParser` also accepts `{ error: { code, message } }`
  (section 4.5: one parser for both services). Existing shapes keep working.

## Model rules

- Responses pass through in the server's snake_case, as every other resource does: the envelope
  is what `--json` will print.
- An optional field is always present and carries `null` when empty (section 4.6), so the types
  spell `| null`, never `| undefined`: the views of the next PRs test `=== null`.
- `kind` and `state` are open sets (section 4.6). Known values are literal branches; one more
  branch is `{ kind: string; href?: string }` so a newer WS cannot break an older CLI. Same for
  `MigrationState`. Every future `switch` over them has a `default`; this is the opposite of
  `SdkErrorKind`, whose set we own.
- No validation rules yet: reads take no input worth checking.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| `list()` | `GET /migrations` | `MigrationList` — `{ items, available }` |
| `get(id)` | `GET /migrations/{id}` | `Envelope` |
| `resource(id, name)` | `GET /migrations/{id}/resources/{name}` | `Envelope<TResult>` |

## Tests

- `test/sdk/adapty/migrations/resource.test.ts` — `createScriptedFetch`, as `apps/resource.test.ts`
  does: each method hits its URL with the bearer token and returns the body untouched.
- `test/sdk/adapty/errors.test.ts` — new case: the WS body yields `code` and `message`; the three
  existing bodies still parse the same.
- `test/fixtures/migration-envelope.json` — the `action_required` example from section 1, so the
  views of the next PRs render a real envelope.

## Done when

- `pnpm build && pnpm test` green; frozen-legacy and eslint zones untouched (nothing in `src/lib`,
  nothing hand-written in `src/commands`).
- `docs/architecture.md`: `migrations` listed among the resources of `createAdapty`.

## Pin with the WS team before merging

1. **Path.** We use `https://api-admin.adapty.io/api/v1/developer/migrations` — same host and
   base as `apps`/`auth`. Risk: section 4.6 says WS owns its own `/v1/` → `/v2/`, independent of
   the developer API's, which reads as its own namespace, not nested under `/developer`. Ask WS
   for the literal full URL of `GET /v1/migrations`.
2. **Trailing slash.** We send `/migrations/{id}/` (Django style). Ask WS to confirm it's accepted
   as is, not 404 or redirected.
3. **409 after `--yes`.** A confirmed action's `confirm` text was shown for a specific `revision`;
   if that `revision` moved before the `POST` lands, silently retrying with the new one would act
   on consequences the user never saw. Proposed behavior: a confirmed action's 409 is a hard stop
   (exit 4, "migration changed — re-run `status`, then `run <action> --yes` again"), no auto-retry.
   An action with no `confirm` keeps the plain reread-and-retry of section 4.1. Ask WS to confirm
   this reading.
