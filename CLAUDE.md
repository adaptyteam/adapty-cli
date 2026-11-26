# Adapty CLI

CLI for Adapty Developer API. Built with oclif (v4) + TypeScript (ESM).

## Build & Run

```sh
pnpm install
pnpm build          # tsc → dist/
pnpm test           # mocha + eslint
pnpm lint           # eslint only
./bin/run.js        # run locally without install
```

## Structure

```
src/
  commands/          # oclif command classes
    auth/            # login (device flow OAuth), logout, revoke, whoami, status
    apps/            # list, get, create, update
    products/        # list, get, create, update, push (to App Store Connect or Google Play, asks first);
                     # create, get, update and push are in src/cli/commands/products
    product-groups/  # list, create (App Store subscription groups; Google Play lists only); implementation in src/cli/commands/product-groups
    product-prices/  # list (table or --csv), set (preview, then save; --file or --country; --dry-run, --wait, asks first);
                     # implementation in src/cli/commands/product-prices
    product-offers/  # list, get, create, update (no delete: dashboard only); implementation in src/cli/commands/product-offers
    paywalls/        # list, get, create, update, placements (placements using a paywall);
                     # metrics/ (list, get, values — the dashboard metrics page; implementation in src/cli/commands/paywalls/metrics)
    ab-tests/        # list, get, create, update, start, stop, replace, archive — regular paywall and flow tests;
                     # start, stop, replace and archive ask first (cli/input/confirm.ts, --yes; exit 6 when nobody can answer).
                     # Implementation in src/cli/commands/ab-tests;
                     # metrics/ (list, get, values, total — the dashboard A/B results; implementation in src/cli/commands/ab-tests/metrics)
    placements/      # list (--type), get, create, update (audiences[] or deprecated --paywall-id);
                     # metrics/ (list, get, values — flow and paywall placements, --type; implementation in src/cli/commands/placements/metrics)
    flows/           # list, get, create; config/ (get, update — builder config with optimistic lock;
                     # preview — local config → render URL, opens on a TTY, prints bare URL when piped;
                     # capture is the caller's job, the CLI only builds the URL;
                     # validate — advisory publishability check, always 200, exits non-zero when invalid);
                     # media/ (upload — multipart image upload, returns CDN url to reference in a config;
                     # upload-video — mp4 or webm, returns the video and preview URLs; implementation in
                     # src/cli/commands/flows/media/upload-video.ts, rules in src/sdk/adapty/flow-media.ts);
                     # metrics/ (list, get, values — the dashboard metrics page; implementation in src/cli/commands/flows/metrics);
                     # funnel/ (get, values — the screen funnel of one flow version, --csv is the dashboard CSV from the server;
                     # implementation in src/cli/commands/flows/funnel);
                     # versions/ (list, get, preview, rename, restore — the version history; restore asks before it
                     # replaces a draft, --yes needs --expected-updated-at); duplicate (a copy as a new flow);
                     # implementation in src/cli/commands/flows/versions and src/cli/commands/flows/duplicate.ts
                     # publish — refreshes the _meta.fonts copy of a config that names a custom font, saves it
                     # when it changed, then publishes; implementation in src/cli/commands/flows/publish, the rule
                     # in src/sdk/adapty/flow-fonts.ts
    fonts/           # list, get, upload, add, rename, usage; faces/ (update, default, move, replace) — custom fonts
                     # of an app; upload and add send a package file by file and report each file (exit 4 when one
                     # was refused); faces replace asks first (cli/input/confirm.ts, --yes; exit 6 when nobody can
                     # answer). Implementation in src/cli/commands/fonts, the shared steps in
                     # cli/base/adapty/fonts-command.ts, the resource in src/sdk/adapty/fonts
    migrations/      # create, list, use, current, unuse, status (--wait), steps, show, run, close — a thin client of the
                     # Wizard Service: the flow lives on the server, every answer is one envelope.
                     # Implementation in src/cli/commands/migrations
    fallbacks/       # get. Implementation in src/cli/commands/fallbacks
    refund-saver/    # get, on, off, update, readiness, requests, metrics, profile (get, update).
                     # Implementation in src/cli/commands/refund-saver
    segments/        # list, get
    hypotheses/      # list, get, summary, by-ab-test, create (from a JSON file, always the batch route, client-minted
                     # hypothesis_id), accept, link, resolve, reresolve, unaccept, dismiss, restore, unlink — the backlog
                     # of changes per placement; implementation in src/cli/commands/hypotheses
    retention-messaging/ # setup-status, realtime-url (get, configure — asks; another server's URL needs
                     # --replace-other-url with no terminal), performance-test start, messages (list, get, create, update,
                     # set-status — create, update and set-status ask in both modes), products|promo-offers|plan-switches
                     # suggest; Apple Retention Messaging. Implementation in src/cli/commands/retention-messaging, rules
                     # (PNG checks, the merge of an update, the multipart form) in src/sdk/adapty/retention-messaging
    skills/          # install — the Adapty skills into the coding agents on PATH, through each agent's own
                     # plugin or skills command. Implementation in src/cli/commands/skills
    access-levels/   # list, get, create, update
    virtual-currencies/ # list, get, create, update, mappings (upsert, delete), transactions list, profiles (transactions
                     # list, balances get); create and the mapping writes ask (--yes; the mapping writes need
                     # --expected-updated-at with --yes); the ledger lists page by --cursor, one page for each call.
                     # Implementation in src/cli/commands/virtual-currencies, rules in src/sdk/adapty/virtual-currencies
    asa/             # Apple Search Ads: whoami, connect, orgs, apps, campaigns, ad-groups, keywords (incl. recommend, duplicates),
                     # negative-keywords, search-terms, ads, product-pages, creatives, automations, metrics,
                     # competitors, change-history
  lib/
    api-client.ts    # HTTP client (fetch-based, bearer auth)
    config.ts        # ~/.config/adapty/config.json read/write
    auth.ts          # token resolution (config or ADAPTY_TOKEN env)
    client-from-config.ts  # factory: reads config → ApiClient
    errors.ts        # ApiError, NetworkError, AuthRequiredError
    flags.ts         # shared flags: pagination, UUID check (--app is appIdFlag in cli/input/app.ts)
    output.ts        # printResponse(), printList() helpers (auto-formats snake_case keys)
    app-url.ts       # dashboard base URL (ADAPTY_APP_URL): route building + rehosting API-issued links
    asa-client.ts    # factory: ApiClient against the ASA service (errorFormat 'asa')
    asa-flags.ts     # shared asa flags: scope filters, period, money, batch caps, add-as-keyword action
    asa-confirm.ts   # mutation preview + confirmation prompt (--yes; refuses when piped or --json)
    asa-keyword-action.ts  # add-as-keyword-to params: rebuild from flags per operate_with, reject
                     # the shapes the API would silently mis-resolve
    asa-schemas.ts   # response typings for asa entities
    preview.ts       # flow config normalization + render URL / gzip fragment building
```

## Where new code goes

The tree above is the pre-sdk stack, and it is **frozen**: no new file in `src/lib`, no new
hand-written command in `src/commands`. New work goes to

```
src/
  sdk/               # the API: core/ (transport, errors, session, clock, dates) + adapty/ (resources, rules;
                     # analytics/: catalog, values and the six analytics operations of an app)
                     # + attribution/ (Attribution analytics: catalog, report, values)
  cli/               # the oclif adapter: base commands, session, exit codes, flags, views
```

A migrated command keeps a one-line re-export under `src/commands`, because oclif discovers
commands only there. `test/architecture/frozen-legacy.test.ts` fails on any other new file, and the
eslint zones in `eslint.config.mjs` fail on a new import into `src/lib`. Layers and contracts:
`docs/architecture.md`.

## Conventions

- oclif topic separator is space (e.g. `adapty apps list`, not `adapty apps:list`)
- All resource commands scoped under `--app APP_ID` (UUID, validated) — except `asa`, which is scoped by the
  token's company (`--app` there is only a list filter), and the `attribution metrics` and `attribution dimensions`
  catalog reads, which are the same for every app and take no `--app`
- `list` commands use shared pagination flags (--page, --page-size)
- `analytics` data commands print the human view, the API answer (`--json`) or a CSV made from it (`--csv`); the
  views live in `cli/views/analytics/` and keep the total first, `—` for null, `No data for this period.` when empty;
  the human view is a short table (`human.ts`), the CSV every field (`segments.ts`)
- Commands support `--json` flag via oclif's `enableJsonFlag = true`
- Relative imports use explicit `.js` extensions, including `/index.js` for module entry points
  (Node.js ESM + TypeScript `nodenext`)
- Import the Adapty command adapter through `cli/base/adapty/index.js` (the attribution one through
  `cli/base/attribution/index.js`); files inside that module import each other directly
- Auth token stored at `~/.config/adapty/config.json` (mode 0o600)
- `ADAPTY_TOKEN` env overrides stored token
- Region of a command (`us` or `eu`): hidden `auth login --region`, then `ADAPTY_REGION`, then the `region`
  saved in the session file (read also when `ADAPTY_TOKEN` is set), then `us`. It picks the developer API
  host (EU: `https://api-eu-admin.adapty.io/api/v1/developer`) in both stacks: the table in
  `cli/base/adapty/openSession.ts` and its legacy copy in `lib/api-client.ts` (a `lib` file must not import the
  adapter: `build.ts` imports `lib/client-from-config.ts`). A bad value is a usage error (exit 2); a damaged or
  unreadable session file the region must come from stops the command (exit 3), except `auth login` with a
  region named, which replaces it. `auth status` shows the region the commands go to, only when it is EU
- `ADAPTY_API_URL` env overrides the API base URL of any region (warning only when it differs from the US default)
- `ADAPTY_APP_URL` env sets the dashboard base URL (default `https://app.adapty.io`), via `lib/app-url.ts`:
  `flows config preview` builds the fixed `/flow-preview` route on it, and `auth login` rehosts the
  API-issued verification link onto it (only when the env var is set — the API may serve that link from
  another host)
- `flows config preview` only builds a URL: no browser automation, no Playwright, no screenshot. Capture
  belongs to the caller (its own browser tool, or the flow skill's reference script)
- `flows config preview` always carries the config in the URL fragment; there is no file hand-off flag. It is
  a quick-look escape hatch for small configs — past ~32KB of pretty-printed JSON the render page turns slow
  and unreliable. The URL is long either way (~113K chars for a 668KB flow), so callers pipe it into the
  screenshot tool rather than print or read it
- API base: `https://api-admin.adapty.io/api/v1/developer`
- `asa` topic talks to its own service: base `https://api-asa-admin.adapty.io/api/v1/cli`, overridden by
  `ADAPTY_ASA_API_URL`; same bearer token, but errors follow the ASA shape (per-item `errors[]`, FastAPI
  `detail`, `Retry-After` on 429); no EU host: with the region `eu` every `asa` command refuses before any
  request (exit 2, `region_not_supported`)
- `attribution` topic talks to the UA attribution service: base `https://api-ua.adapty.io/api/v1/cli`, overridden by
  `ADAPTY_ATTRIBUTION_API_URL`; same bearer token, no app header (`report` and `values` take `--app`, the catalogs
  none), errors in the `errors[]` envelope with `error_code`; `report` and `values` are POSTs that are never retried;
  no EU host: with the region `eu` every `attribution` command refuses before any request (exit 2,
  `region_not_supported`)

## Key Patterns

- Each migrated command is a single class extending `BaseCommand` when authorization is optional,
  or `AdaptyCommand` when an Adapty token is required. `BaseCommand` owns output, cancellation and
  error mapping; the Adapty SDK and session belong in `cli/base/adapty/`
- `AdaptyCommand` checks the token on access to `this.session` or `this.adapty`; parse and validate
  input first. Auth commands use `openSession()` and `build()` explicitly as needed
- Commands that work on the saved migration extend `MigrationCommand` (same door,
  `cli/base/adapty/index.js`) and ask `this.currentMigration`
  (`get` / `require` / `set` / `clear` / `clearFor` / `overridden`). `ADAPTY_MIGRATION`, the context file and the
  token fingerprint live behind that object, in `cli/context/migration/`, and nowhere else

The following client factories and output helpers belong to the frozen legacy stack:

- `createAuthenticatedClient(config)` — factory for token-aware ApiClient
- `createAsaClient(config)` — same, against the ASA service; asa writes print the request body and ask for
  confirmation before sending (`asa-confirm.ts`)
- All asa POST/PUT go through `asaWrite()` (`asa-client.ts`): auto `Idempotency-Key` (pin with
  `--idempotency-key`), one retry on NetworkError with the same key, replayed responses get a printed note
- `PaginatedResponse<T>` — standard list response wrapper
- Human output via `printResponse()`/`printList()` (auto-formats snake_case → labels); JSON output via oclif flag
- All entities use `title` field (not `name`) in API requests and responses
- App bundle IDs: `apple_bundle_id` / `google_bundle_id` (not ios/android)
- Auth: device flow OAuth (POST /auth/device → poll /auth/token)
