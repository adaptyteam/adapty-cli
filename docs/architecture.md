# Architecture

Two layers. `src/sdk` knows the Adapty API and nothing else; `src/cli` knows oclif, the terminal
and the machine it runs on. The arrow points one way — the sdk never imports the cli — which is
what lets the same product code run under another adapter (an MCP server) later.

```
src/
├── sdk/
│   ├── core/      # transport and primitives, no Adapty knowledge
│   └── adapty/    # the Developer API: paths, shapes, rules
└── cli/           # oclif adapter: flags, views, exit codes, env
```

## The dependency rule

| Layer | May import |
| --- | --- |
| `sdk/core` | itself |
| `sdk/adapty` | `sdk/core` |
| `src/cli` | both |

Plus two more: `sdk/core/http` is a module with a single door (`core/http/index.js`), and inside it
the transport depends only on `core/errors` and `core/clock`.

`no-restricted-imports` zones in `eslint.config.mjs` enforce all of this, so a wrong import fails
`pnpm lint` rather than review.

## sdk/core

Everything here would be the same for any HTTP API.

- `http/` — the transport: base URL, bearer token, JSON both ways, responses mapped to sdk errors,
  retry for idempotent requests. Error parsing (`policies.ts`) and the retry rule are parameters,
  because services word rejections differently.
- `errors.ts` — the error taxonomy. Every error has a stable `kind` and carries no user-facing text
  and no exit code; assigning both is the adapter's job.
- `session.ts` — `SessionStore` is a port; `createFileSessionStore(dir)` is the file implementation.
  The directory comes from the caller: the sdk touches neither `HOME` nor `process.env`.
- `clock.ts` — time as a dependency, so retry and device flow are testable without waiting.
- `auth/device-flow.ts` — RFC 8628 orchestration with every effect outside it: network behind a
  port, time behind `Clock`, cancellation behind a signal.
- `validation.ts` — `assertValid(issues)`, the only place a rule's problems become a throw.
- `testing.ts` — the fakes (`createFakeClock`, `createScriptedFetch`) any consumer's tests can use.

## sdk/adapty

The Developer API assembled on top of core. `createAdapty(options)` builds one transport and hangs
resources off it (`apps`, `auth`, `accessLevels`).

A resource owns everything about its entity: paths, request/response shapes, and its business
rules as pure functions returning `Issue[]`. Rules return lists instead of throwing, so a table
test walks them without an environment and the user sees every problem at once.

A resource with nothing but paths and shared shapes is one file (`access-levels.ts`). One whose
operations carry knowledge of their own — an input shape, a rule, a request body, a protocol
step — becomes a directory, cut by operation rather than by kind of code, so that a change to
"creating an app" stays inside one file:

```
apps/
├── index.ts      # the door: re-exports only, and only what a consumer uses
├── model.ts      # what the operations share: the entity as the server sends it
├── create.ts     # input shape, rules and request body of one operation
├── update.ts
└── resource.ts   # the endpoint map: paths, and the rule check before each write
```

A `types.ts` or a `lib/` would be the other cut, by kind, and it costs what this one buys: three
files open to read one operation, request shapes exported only to be moved, and a directory named
after nothing. Outside the resource nobody sees either way — imports go through `index.ts`.

`auth/` is the same shape with one difference worth knowing: a device flow step is its path and
the reading of its answer together, so `device-code.ts` and `poll-token.ts` keep their own paths,
and `resource.ts` holds only what the resource *is* — the `DeviceAuthApi` port it satisfies, plus
`me` and `revokeToken`. The endpoint map is a property of `apps`, not a law.

Responses pass through in the server's snake_case (that is what `--json` has always printed);
input is camelCase, because that side is our API, not the server's.

`AdaptyOptions` is deliberately narrower than `HttpOptions`: the transport seams are product
knowledge, and two adapters overriding them would read the same answers differently.

## src/cli

The adapter. It resolves the environment, builds the sdk, turns flags into inputs and results into
text or JSON.

- `base/base-command.ts` — output channel, `SIGINT` → abort signal, error mapping, `render()`.
  It owns no product SDK or session, so another product such as ASA can reuse it directly.
- `base/adapty/index.ts` — the public entry point: commands import `AdaptyCommand`, `build`,
  `openSession` and session types from here. Implementation files import each other directly.
- `base/adapty/openSession.ts` — reads `ADAPTY_TOKEN` and `ADAPTY_API_URL`, picks the config dir
  from oclif, and returns where to talk, as whom, and the store to write through. `openSession(config)`
  also warns about a non-default API URL.
- `base/adapty/build.ts` — `build(session, context)` assembles the SDK with cancellation,
  User-Agent and retry warnings. Both authenticated commands and auth commands use it.
- `base/adapty/adapty-command.ts` — resolves an Adapty session and lazily builds its SDK. "Needs
  authorization" is expressed in what a command extends, not re-checked inside `run()` bodies.
- `errors.ts` — the single `SdkError` → CLI error mapping. The switch has no default, so a new
  error kind fails to compile until it is given a message and an exit code.
- `flags.ts` — shared flags and args (app id UUID, pagination) and the one place flag names meet
  sdk field names.
- `views/` — plain functions, value in, string out.
- `commands/` — one class per command.

### Command bases and imports

```text
base/
├── base-command.ts
└── adapty/
    ├── index.ts
    ├── adapty-command.ts
    ├── build.ts
    └── openSession.ts
```

Commands that can run without authorization extend `BaseCommand`; it neither opens a session nor
requires a token. This includes `auth login`, `auth status`, `auth logout` and `auth revoke`.
They call `openSession()` and `build()` explicitly when needed. `build()` accepts a session without
a token, as required by login.

Commands that require Adapty authorization extend `AdaptyCommand`. It resolves the session during
`init()`, then checks the token when `this.session` or `this.adapty` is accessed. Parse and validate
input before that access so input errors take precedence over a missing token. A future ASA adapter
can live in `base/asa/` and extend the same `BaseCommand`.

Commands import the Adapty adapter through its public entry point:

```ts
import { AdaptyCommand, build, openSession } from '../../base/adapty/index.js';
```

`index.ts` contains explicit re-exports of the public API and session types. Files inside the module
import each other directly to avoid cycles through the entry point. Tests of internal helpers may
also import their implementation files directly.

The project uses Node.js ESM and TypeScript `nodenext`. Relative imports include the emitted `.js`
extension even in TypeScript source. Directory imports spell out `/index.js`: Node.js does not
resolve `../../base/adapty` to its index automatically. See
[Node.js: mandatory file extensions](https://nodejs.org/api/esm.html#mandatory-file-extensions).

### Exit codes

| Code | Meaning |
| --- | --- |
| 2 | usage — bad input (oclif's own parse errors too) |
| 3 | auth — no token, expired, or authorization refused |
| 4 | api — the server rejected a well-formed request |
| 5 | network — the server was never reached |
| 130 | cancelled — Ctrl+C (128 + SIGINT) |

### The `--json` contract

`run()` returns the data and `render()` prints it, so the return type *is* the JSON contract,
checked by the compiler: change a shape in the sdk and the command stops compiling instead of
quietly changing what users parse.

## Where a change goes

| Change | Place |
| --- | --- |
| New endpoint | a resource module in `sdk/adapty` |
| New rule ("X is required when Y") | next to the operation it constrains, in `sdk/adapty` |
| New command | `cli/commands/...` + a re-export in `src/commands/...` |
| New flag | the command, or `cli/flags.ts` if shared |
| New error kind | `sdk/core/errors.ts` + `cli/errors.ts` (the compiler insists) |
| Adapty session environment variables | `cli/base/adapty/openSession.ts` |

## Migration state

The pre-sdk stack (`src/lib` + the commands written against it) is still there and still serves
most topics. Migrated so far: `apps` and `auth`.

oclif discovers commands only under `src/commands`, so a migrated command keeps a one-line file
there re-exporting the real class from `src/cli/commands`.

Both stacks read and write the same session file — `{ "access_token", "user" }`, mode 0600 — and
`test/cli/legacy-compat.test.ts` holds that contract in both directions for as long as they coexist.

`auth revoke` now revokes the effective token (`ADAPTY_TOKEN` takes precedence), whereas the old
command targeted only the token in the file. It removes the stored session only if its token matches
the revoked one; a different stored token remains usable. With no effective token, it keeps the old
successful no-op and `{ "status": "not_authenticated" }` JSON result.

The apps adapter runs the SDK's pure validation rules before requiring a token. The SDK also keeps
its own validation so other adapters cannot bypass the rules.

### The old stack is frozen

Nothing new goes into `src/lib` or into a hand-written command. Two guards, because they catch
different mistakes:

- `test/architecture/frozen-legacy.test.ts` inventories both directories against a committed list.
  A new file in `src/lib`, or a file under `src/commands` that is neither on the list nor a
  re-export, fails the test. The lists are also the migration's remaining scope: a line leaves when
  the module is ported, and the test insists on that too, so they cannot drift into fiction.
- The eslint zone for `src/cli` names the only three modules it may still borrow — `output.js`,
  `app-url.js`, `client-from-config.js`. A fourth bridge means porting the helper into the sdk, or
  editing `eslint.config.mjs` on purpose. (`src/sdk` may not touch `src/lib` at all.)

## Tests

`test/` mirrors `src/`. Sdk tests use `sdk/core/testing.ts` and never touch the network or the
clock; cli tests run commands through oclif and assert on output and exit codes.
