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
    paywalls/        # list, get, create, update
    placements/      # list, get, create, update
    access-levels/   # list, get, create, update
  lib/
    api-client.ts    # HTTP client (fetch-based, bearer auth)
    config.ts        # ~/.config/adapty/config.json read/write
    auth.ts          # token resolution (config or ADAPTY_TOKEN env)
    client-from-config.ts  # factory: reads config → ApiClient
    errors.ts        # ApiError, NetworkError, AuthRequiredError
    flags.ts         # shared flags: --app (UUID), pagination
    output.ts        # printResponse(), printList() helpers (auto-formats snake_case keys)
```

## Conventions

- oclif topic separator is space (e.g. `adapty apps list`, not `adapty apps:list`)
- All resource commands scoped under `--app APP_ID` (UUID, validated)
- `list` commands use shared pagination flags (--page, --page-size)
- Commands support `--json` flag via oclif's `enableJsonFlag = true`
- Auth token stored at `~/.config/adapty/config.json` (mode 0o600)
- `ADAPTY_TOKEN` env overrides stored token
- `ADAPTY_API_URL` env overrides default API base URL
- API base: `https://api-admin.adapty.io/api/v1/developer`

## Key Patterns

- Each command: single class extending `Command` in its own file
- `createAuthenticatedClient(config)` — factory for token-aware ApiClient
- `PaginatedResponse<T>` — standard list response wrapper
- Human output via `printResponse()`/`printList()` (auto-formats snake_case → labels); JSON output via oclif flag
- All entities use `title` field (not `name`) in API requests and responses
- App bundle IDs: `apple_bundle_id` / `google_bundle_id` (not ios/android)
- Auth: device flow OAuth (POST /auth/device → poll /auth/token)
