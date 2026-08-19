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
    products/        # list, get, create, update
    paywalls/        # list, get, create, update, placements (placements using a paywall)
    placements/      # list, get, create, update (audiences[] or deprecated --paywall-id)
    flows/           # list, get, create; config/ (get, update — builder config with optimistic lock;
                     # preview — local config → render URL, opens on a TTY, prints bare URL when piped;
                     # capture is the caller's job, the CLI only builds the URL)
    segments/        # list, get
    access-levels/   # list, get, create, update
    asa/             # Apple Search Ads: whoami, connect, orgs, apps, campaigns, ad-groups, keywords,
                     # negative-keywords, search-terms, ads, product-pages, creatives, automations, metrics,
                     # competitors
  lib/
    api-client.ts    # HTTP client (fetch-based, bearer auth)
    config.ts        # ~/.config/adapty/config.json read/write
    auth.ts          # token resolution (config or ADAPTY_TOKEN env)
    client-from-config.ts  # factory: reads config → ApiClient
    errors.ts        # ApiError, NetworkError, AuthRequiredError
    flags.ts         # shared flags: --app (UUID), pagination
    output.ts        # printResponse(), printList() helpers (auto-formats snake_case keys)
    app-url.ts       # dashboard base URL (ADAPTY_APP_URL): route building + rehosting API-issued links
    asa-client.ts    # factory: ApiClient against the ASA service (errorFormat 'asa')
    asa-flags.ts     # shared asa flags: scope filters, period, money, batch caps
    asa-confirm.ts   # mutation preview + confirmation prompt (--yes; refuses when piped or --json)
    asa-schemas.ts   # response typings for asa entities
    preview.ts       # flow config normalization + render URL / gzip fragment building
```

## Conventions

- oclif topic separator is space (e.g. `adapty apps list`, not `adapty apps:list`)
- All resource commands scoped under `--app APP_ID` (UUID, validated) — except `asa`, which is scoped by the
  token's company (`--app` there is only a list filter)
- `list` commands use shared pagination flags (--page, --page-size)
- Commands support `--json` flag via oclif's `enableJsonFlag = true`
- Auth token stored at `~/.config/adapty/config.json` (mode 0o600)
- `ADAPTY_TOKEN` env overrides stored token
- `ADAPTY_API_URL` env overrides default API base URL
- `ADAPTY_APP_URL` env sets the dashboard base URL (default `https://app.adapty.io`), via `lib/app-url.ts`:
  `flows config preview` builds the fixed `/flow-preview` route on it, and `auth login` rehosts the
  API-issued verification link onto it (only when the env var is set — the API may serve that link from
  another host)
- `flows config preview` only builds a URL: no browser automation, no Playwright, no screenshot. Capture
  belongs to the caller (its own browser tool, or the flow skill's reference script)
- `--payload-out` and the URL fragment are alternatives — with a payload file the fragment is omitted, since
  the render page ignores the hash once it is handed a file (and repeating the config doubles agent output)
- API base: `https://api-admin.adapty.io/api/v1/developer`
- `asa` topic talks to its own service: base `https://api-asa-admin.adapty.io/api/v1/cli`, overridden by
  `ADAPTY_ASA_API_URL`; same bearer token, but errors follow the ASA shape (per-item `errors[]`, FastAPI
  `detail`, `Retry-After` on 429)

## Key Patterns

- Each command: single class extending `Command` in its own file
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
