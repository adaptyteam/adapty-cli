---
title: "feat: Adapty CLI Developer API Client"
type: feat
status: completed
date: 2026-02-19
brainstorm: docs/brainstorms/2026-02-19-adapty-cli-brainstorm.md
backend_plan: adapty-dashboard-api/docs/plans/2026-02-17-feat-developer-quick-start-api-plan.md
---

# Adapty CLI — Developer API Client

## Overview

CLI client for Adapty Developer API. Handles device-flow auth, token storage, CRUD for apps/products/access-levels/paywalls/placements. Dual-mode: human-readable default + `--json` for agents.

Built on oclif v4 scaffold already in place. TypeScript, ESM, native fetch, zero extra runtime deps (except `open` for browser).

## Architecture

```
src/
├── commands/
│   ├── auth/
│   │   ├── login.ts              # Device flow auth
│   │   ├── logout.ts             # Remove local token
│   │   ├── status.ts             # Show auth state (local only)
│   │   └── whoami.ts             # GET /me — verify token, show user + companies
│   ├── apps/
│   │   ├── create.ts             # POST /apps
│   │   ├── get.ts                # GET /apps/:id
│   │   └── list.ts               # GET /apps
│   ├── products/
│   │   ├── create.ts             # POST /apps/:app_id/products
│   │   └── list.ts               # GET /apps/:app_id/products
│   ├── access-levels/
│   │   ├── create.ts             # POST /apps/:app_id/access-levels
│   │   └── list.ts               # GET /apps/:app_id/access-levels
│   ├── paywalls/
│   │   ├── create.ts             # POST /apps/:app_id/paywalls
│   │   └── list.ts               # GET /apps/:app_id/paywalls
│   └── placements/
│       ├── create.ts             # POST /apps/:app_id/placements
│       └── list.ts               # GET /apps/:app_id/placements
├── lib/
│   ├── api-client.ts             # fetch wrapper: base URL, auth header, error handling
│   ├── config.ts                 # Read/write ~/.config/adapty/config.json
│   ├── auth.ts                   # Token resolution: ADAPTY_TOKEN env > config file
│   ├── errors.ts                 # Error formatting (human + JSON)
│   └── output.ts                 # Human output helpers (key:value lines)
└── index.ts                      # Re-export (existing)
```

### Key Design Decisions

- **No base command class** — use utility imports from `lib/`. Keeps commands flat and simple.
- **`lib/api-client.ts`** — single fetch wrapper. Handles auth header injection, base URL resolution, error normalization, `User-Agent` header.
- **`lib/config.ts`** — reads/writes config JSON. Creates dir if missing. Sets file perms to 0600.
- **`lib/auth.ts`** — resolves token: `ADAPTY_TOKEN` env var > `config.json` access_token. Single function.

## Technical Approach

### Phase 1: Foundation (lib/ + auth commands)

#### 1.1 Config Management — `src/lib/config.ts`

```typescript
interface AdaptyConfig {
  access_token?: string
  user?: { email: string; name: string }
}
```

- Read: `JSON.parse(readFile(configPath))`, return empty object on missing/corrupt file
- Write: `writeFile(configPath, JSON.stringify(config, null, 2))`, create dir with `mkdir -p`, set file mode `0o600`
- Config path: use oclif's `this.config.configDir` from commands, or `~/.config/adapty` for lib

#### 1.2 Auth Resolution — `src/lib/auth.ts`

Token precedence:
1. `ADAPTY_TOKEN` env var (if set and non-empty)
2. `config.json` `access_token` field

Return token string or `null`. Commands call this; if null, print "Not authenticated. Run `adapty auth login`." and exit with code 4.

#### 1.3 API Client — `src/lib/api-client.ts`

```typescript
const DEFAULT_API_URL = 'https://api.adapty.io/api/v1/developer'

class ApiClient {
  constructor(private baseUrl: string, private token: string | null) {}

  async get(path: string, params?: Record<string, string>): Promise<ApiResponse>
  async post(path: string, body: unknown): Promise<ApiResponse>
}
```

- Base URL: `ADAPTY_API_URL` env var > `DEFAULT_API_URL`
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `User-Agent: adapty-cli/<version> node/<node-version> <os>/<arch>`
- Error handling: parse response, throw typed errors for 4xx/5xx
- No retry logic (YAGNI for MVP)

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error (4xx/5xx) |
| 2 | CLI usage error (missing flags, bad input) — oclif default |
| 3 | Network error (fetch failed) |
| 4 | Auth required (no token) |

#### 1.4 Error Formatting — `src/lib/errors.ts`

Normalize API errors into consistent shape:

**Human mode:**
```
Error: Access level sdk_id already exists
Field errors:
  sdk_id: Already exists for this app
```

**JSON mode (`--json`):**
```json
{"error_code": "paid_access_level_sdk_id_already_exists_error", "errors": {"sdk_id": ["Already exists for this app"]}, "status_code": 400}
```

Normalize three error shapes from API into single CLI envelope:
- Domain errors: `{errors: {field: [msg]}, error_code, status_code}` — pass through as-is
- Device flow errors: `{error: "authorization_pending"}` — map to `{error_code: "authorization_pending", status_code: 400}`
- Network errors: `{error_code: "network_error", errors: {"connection": ["..."]}, status_code: 0}`
- 401 specifically: print "Token expired or invalid. Run `adapty auth login`." and exit code 1 (not 4 — token exists but is invalid)
- 5xx: print "Server error. Try again later." (distinct from network errors)

#### 1.5 `adapty auth login` — `src/commands/auth/login.ts`

Device flow implementation:

```
1. If already authenticated: warn "Already authenticated as <email>. Re-authenticating..."
2. POST /auth/device {client_id: "adapty-cli"} (no auth header)
3. Print user_code prominently
4. Try open(verification_uri_complete), always print URL as fallback
5. Poll POST /auth/token every `interval` seconds (from step 2 response, typically 5):
   - authorization_pending → continue
   - slow_down → increase interval by 5s, continue
   - expired_token → exit "Code expired. Run `adapty auth login` again."
   - access_denied → exit "Authorization denied."
   - success → save token + user to config, print "Authenticated as <email>"
6. Handle Ctrl+C: clean exit with message "Login cancelled."
```

Request body for token poll: `{grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "<code>"}`

Browser open: use `open` npm package (handles macOS/Linux/Windows/WSL/Snap/flatpak).
Wrap in try/catch — suppress errors silently (URL is always printed as fallback).

No `--json` flag on this command (interactive by nature).

#### 1.6 `adapty auth logout` — `src/commands/auth/logout.ts`

- Remove `access_token` and `user` from config file
- Print: "Logged out. Note: token remains valid server-side until expiry."
- If not authenticated: "Not currently authenticated."
- `enableJsonFlag = true` → `--json` returns `{"status": "logged_out"}`

#### 1.7 `adapty auth whoami` — `src/commands/auth/whoami.ts`

- Calls `GET /me` (authenticated) — verifies token works server-side
- Returns user email, name, companies
- `enableJsonFlag = true`

**Human output:**
```
Email: jane@example.com
Name: Jane Doe
Companies:
  My Company (550e8400-...)
```

**JSON output:** raw API response from `GET /me`.

#### 1.8 `adapty auth status` — `src/commands/auth/status.ts`

- Read local config only (no network call — matches "let 401 happen" decision)
- If authenticated: show email, token prefix (masked: `dev_live_AbCd****.****`), config path
- If not: "Not authenticated. Run `adapty auth login`."
- `enableJsonFlag = true`

**Human output:**
```
Email: jane@example.com
Token: dev_live_AbCd****.****
Config: ~/.config/adapty/config.json
```

**JSON output:**
```json
{"email": "jane@example.com", "token_prefix": "dev_live_AbCd", "config_path": "~/.config/adapty/config.json", "authenticated": true}
```

### Phase 2: App Commands

#### 2.1 `adapty apps create` — `src/commands/apps/create.ts`

`enableJsonFlag = true`

**Flags:**
| Flag | Type | Required | Notes |
|------|------|----------|-------|
| `--name` | string | yes | App name |
| `--platform` | string (multiple) | yes | Repeatable: `--platform ios --platform android` |
| `--ios-bundle-id` | string | conditional | Required when `ios` in platforms |
| `--android-bundle-id` | string | conditional | Required when `android` in platforms |

**Validation (client-side):**
- `--platform` values must be `ios` or `android`
- `--ios-bundle-id` required if `--platform ios`
- `--android-bundle-id` required if `--platform android`

**Request:** `POST /apps`
```json
{
  "app_name": "<name>",
  "platforms": ["ios", "android"],
  "ios_bundle_id": "<bundle_id>",
  "android_bundle_id": "<bundle_id>"
}
```

**API response structure (nested):**
```json
{
  "app": {"id": "uuid", "name": "My App", "sdk_key": "public_live_..."},
  "default_access_level": {"id": "uuid", "sdk_id": "premium"}
}
```

**Human output** (extract from nested response):
```
App created!
ID: 550e8400-...
Name: My App
SDK Key: public_live_xxxxxxxx.yyyyyyyy
Default Access Level ID: 660e8400-...
Default Access Level SDK ID: premium
```

**JSON:** return full nested API response as-is.

#### 2.2 `adapty apps list` — `src/commands/apps/list.ts`

`enableJsonFlag = true`

**Flags:**
| Flag | Type | Required | Default |
|------|------|----------|---------|
| `--page` | integer | no | 1 |
| `--page-size` | integer | no | 20 |

**Validation:** `--page` >= 1, `--page-size` 1-100.

**Request:** `GET /apps?page[number]=<page>&page[size]=<page_size>`

**API response wrapper:** `{data: [...], meta: {pagination: {count, page, pages}}}`. Human output extracts `data` array; `--json` returns full wrapper.

**Human output:**
```
ID: 550e8400-...
Name: My App
SDK Key: public_live_...
---
ID: 660e8400-...
Name: Another App
SDK Key: public_live_...

Page 1 of 3 (42 total)
```

#### 2.3 `adapty apps get` — `src/commands/apps/get.ts`

`enableJsonFlag = true`

**Args:** `app_id` (positional, required) — validated as UUID format client-side.

**Request:** `GET /apps/<app_id>`

**Human output:**
```
ID: 550e8400-...
Name: My App
SDK Key: public_live_...
Secret Key: secret_live_...
Platforms: ios, android
iOS Bundle ID: com.example.myapp
Android Bundle ID: com.example.myapp
```

### Phase 3: App-Scoped Resource Commands

All commands in this phase share a common `--app` flag (UUID, required). Client-side UUID format validation on `--app` — on failure: "Invalid app ID format. Run `adapty apps list` to find your app ID."

#### 3.1 `adapty access-levels list` + `adapty access-levels create`

**list flags:** `--app` (required), `--page`, `--page-size`
**create flags:**

| Flag | Type | Required |
|------|------|----------|
| `--app` | string | yes |
| `--sdk-id` | string | yes |
| `--title` | string | yes |

**Request:** `POST /apps/<app_id>/access-levels` `{"sdk_id": "<sdk_id>", "title": "<title>"}`

**Human output (create):**
```
Access level created!
ID: 770e8400-...
SDK ID: vip
Title: VIP Access
```

#### 3.2 `adapty products list` + `adapty products create`

**list flags:** `--app` (required), `--page`, `--page-size`
**create flags:**

| Flag | Type | Required | Notes |
|------|------|----------|-------|
| `--app` | string | yes | |
| `--name` | string | yes | |
| `--access-level-id` | string | yes | UUID of access level |
| `--period` | option | yes | weekly/monthly/2_months/3_months/6_months/yearly/lifetime |
| `--ios-product-id` | string | conditional | Required if app has iOS |
| `--android-product-id` | string | conditional | Required if app has Android |
| `--android-base-plan-id` | string | conditional | Required with android-product-id |

**Human output (create):**
```
Product created!
ID: 880e8400-...
Name: Monthly Premium
iOS Product: com.example.monthly
Android Product: com.example.monthly (base plan: monthly-base)
```

Note: CLI cannot know app's platforms client-side. Send what's provided, let API validate. If user passes `--ios-product-id` for an Android-only app, API returns 400.

#### 3.3 `adapty paywalls list` + `adapty paywalls create`

**list flags:** `--app` (required), `--page`, `--page-size`
**create flags:**

| Flag | Type | Required |
|------|------|----------|
| `--app` | string | yes |
| `--name` | string | yes |
| `--product-id` | string (multiple) | yes | Repeatable: `--product-id <uuid> --product-id <uuid>` |

**Request:** `POST /apps/<app_id>/paywalls` `{"name": "<name>", "product_ids": ["<uuid>", ...]}`

**Human output (create):**
```
Paywall created!
ID: 990e8400-...
Name: Default Paywall
```

Note: No natural uniqueness — duplicate names create separate paywalls. Acceptable for MVP; agents should `list` before `create`.

#### 3.4 `adapty placements list` + `adapty placements create`

**list flags:** `--app` (required), `--page`, `--page-size`
**create flags:**

| Flag | Type | Required |
|------|------|----------|
| `--app` | string | yes |
| `--name` | string | yes |
| `--developer-id` | string | yes |
| `--paywall-id` | string | yes |

**Request:** `POST /apps/<app_id>/placements` `{"name": "<name>", "developer_id": "<dev_id>", "paywall_id": "<uuid>"}`

**Human output (create):**
```
Placement created!
ID: aa0e8400-...
Developer ID: default
Name: Default Placement
```

### Phase 4: Polish

#### 4.1 package.json Topics

Update `oclif.topics`:
```json
{
  "auth": {"description": "Authentication commands"},
  "apps": {"description": "Manage Adapty apps"},
  "products": {"description": "Manage products"},
  "access-levels": {"description": "Manage access levels"},
  "paywalls": {"description": "Manage paywalls"},
  "placements": {"description": "Manage placements"}
}
```

Remove `hello` topic. Delete `src/commands/hello/` and `test/commands/hello/`.

#### 4.2 User-Agent Header

Every request sends: `User-Agent: adapty-cli/<pkg-version> node/<node-version> <platform>/<arch>`

Read version from oclif's `this.config.version`.

#### 4.3 Config File Security

Set `0o600` permissions on `config.json` after write (token is sensitive). Use `fs.chmod()`.

#### 4.4 Tests

Mirror command structure under `test/commands/`. Use mocha + chai (project standard). Mock `fetch` by injecting ApiClient into commands or using `sinon`.

Priority tests:
1. `auth login` — device flow polling states (pending, slow_down, success, expired, denied)
2. `auth status` — authenticated vs not
3. `apps create` — flag validation (missing bundle ID when platform specified)
4. API client — error normalization (4xx, 5xx, network)
5. Config — read/write/corrupt file handling

## Acceptance Criteria

### Auth
- [x] `adapty auth login` completes device flow, stores token to config file
- [x] `adapty auth login` auto-opens browser, prints URL as fallback
- [x] `adapty auth login` handles slow_down (increase interval), expired_token, access_denied
- [x] `adapty auth login` when already authenticated: warns then proceeds
- [x] `adapty auth login` Ctrl+C exits cleanly
- [x] `adapty auth logout` removes token from config, prints server-side note
- [x] `adapty auth status` shows email + masked token prefix (no network call)
- [x] `adapty auth whoami` calls GET /me, shows user + companies
- [x] `ADAPTY_TOKEN` env var takes precedence over config file

### Resource Commands
- [x] All create commands require flags (no prompts), fail with usage help if missing
- [x] All list commands support `--page` and `--page-size`
- [x] All app-scoped commands require `--app` (UUID, validated client-side)
- [x] `apps create` validates platform-conditional bundle IDs
- [x] `products create` supports `--period` enum with all 7 values
- [x] `paywalls create` supports repeated `--product-id` flag
- [x] `placements create` passes all three required fields

### Dual-Mode Output
- [x] All commands (except `auth login`) support `--json` via oclif `enableJsonFlag`
- [x] Human output: simple key:value lines
- [x] JSON output: raw API response for data, normalized envelope for errors
- [x] Exit codes: 0=success, 1=API error, 2=usage error, 3=network, 4=auth required

### Infrastructure
- [x] `ADAPTY_API_URL` env var overrides default base URL
- [x] Config file created with 0600 permissions
- [x] `User-Agent` header sent on every request
- [x] Corrupt config file handled gracefully (treat as empty)
- [x] Scaffold cleanup: remove hello commands + tests

## Dependencies

| Dependency | Type | Purpose |
|---|---|---|
| `@oclif/core` ^4 | existing | Command framework, flags, args, JSON flag |
| `@oclif/plugin-help` ^6 | existing | Help command |
| `open` ^10 | new runtime | Cross-platform browser open (macOS/Linux/Windows/WSL) |
| Node 18+ `fetch` | built-in | HTTP client |
| `node:fs/promises` | built-in | Config file read/write |

## Risks

| Risk | Mitigation |
|---|---|
| `access-levels` hyphenated dir in oclif | Verify oclif topic routing handles hyphens. Test early in Phase 3. |
| Platform-conditional flag validation | Can't know app platforms client-side. Let API validate, surface clear error. |
| Paywall/app duplicate on retry | Known limitation. Document that agents should `list` before `create`. |
| `open` package adds runtime dep | Small, well-maintained, zero transitive deps. Worth it for cross-platform. |
| Token in config file on shared systems | 0600 permissions mitigate. Document in README. |

## Unresolved Questions

1. **Strip `@oclif/plugin-plugins`?** Adds `adapty plugins` commands that aren't useful. Minor cleanup, no risk.
2. **UUID validation on all ID flags?** Currently only `--app` is validated client-side. Should `--paywall-id`, `--access-level-id`, `--product-id` also validate? Recommend yes for consistency.
3. **`products create` — `--ios-product-id` and `--android-product-id` conditionality.** CLI can't know app platforms. Two options: (a) make both optional, let API validate; (b) require at least one, let API reject mismatched platform. Leaning (a).
