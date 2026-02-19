# Adapty CLI — Brainstorm

**Date:** 2026-02-19
**Status:** Complete

## What We're Building

A CLI client for the Adapty Developer API. Handles device-flow auth, token storage, and exposes individual CRUD commands for apps, products, access levels, paywalls, and placements. Dual-mode: interactive prompts + pretty output for humans, `--json` flag for AI agents.

Backend API plan: `adapty-dashboard-api/docs/plans/2026-02-17-feat-developer-quick-start-api-plan.md`

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary user | Both humans and AI agents | `--json` flag for machine output, interactive prompts for humans |
| Command structure | Topic-based | `adapty auth login`, `adapty apps create` — matches oclif file routing |
| Wizard/quick-start | No | Individual commands only; agents/users compose the flow |
| Token storage | Config file (`~/.config/adapty/`) | Simple, portable. No keychain dependency |
| Company handling | Ignore | Single-company users only |
| App scoping | Explicit `--app` flag | No implicit "current app" state |
| Browser auth | Auto-open + print URL | Fallback URL for headless/SSH environments |
| API base URL | Hardcoded prod, `ADAPTY_API_URL` env var override | Undocumented, for dev/staging use |
| HTTP client | Built-in `fetch` | Zero deps, Node 18+ |
| Human output | Simple key:value lines | Easy to read and grep. `--json` for structured output |
| Create commands | Flags required, no prompts | No inquirer dep. Fail with usage help if missing |
| Token expiry | Let 401 happen | No proactive checks. Suggest re-login on auth failure |
| `--app` format | UUID only | No name lookup, no ambiguity |

## Command Map

```
adapty auth login          # Device flow: get code, open browser, poll for token
adapty auth logout         # Remove stored token
adapty auth status         # Show current auth state (email, token expiry)

adapty apps list           # GET /apps
adapty apps create         # POST /apps
adapty apps get            # GET /apps/:id

adapty products list       # GET /apps/:app_id/products     (--app required)
adapty products create     # POST /apps/:app_id/products    (--app required)

adapty access-levels list  # GET /apps/:app_id/access-levels (--app required)
adapty access-levels create # POST /apps/:app_id/access-levels (--app required)

adapty paywalls list       # GET /apps/:app_id/paywalls     (--app required)
adapty paywalls create     # POST /apps/:app_id/paywalls    (--app required)

adapty placements list     # GET /apps/:app_id/placements   (--app required)
adapty placements create   # POST /apps/:app_id/placements  (--app required)
```

## Auth Flow (Device Code)

```
$ adapty auth login
Opening browser for authentication...
If browser doesn't open, visit: https://app.adapty.io/cli-auth?code=BCDG-HK3N

Your code: BCDG-HK3N

Waiting for authorization... (polling every 5s)
✓ Authenticated as jane@example.com
Token saved to ~/.config/adapty/config.json
```

Polling logic: call `POST /auth/token` every 5s. Handle `authorization_pending`, `slow_down` (increase interval by 5s per RFC 8628), `expired_token`, `access_denied`. On success, store `access_token` in config file.

## Config File Shape

```json
{
  "access_token": "dev_live_AbCdEfGh.xxxxxxxx",
  "user": {
    "email": "jane@example.com",
    "name": "Jane Doe"
  },
  "api_url": "https://api.adapty.io"
}
```

Stored at oclif's config dir: `~/.config/adapty/config.json` (Linux/macOS) or `%LOCALAPPDATA%\adapty\config.json` (Windows).

## Dual-Mode Output

**Human mode (default):**
```
$ adapty apps list
ID: 550e8400-e29b-41d4-a716-446655440000
Name: My App
SDK Key: public_live_xxxxxxxx.yyyyyyyy
---
ID: 660e8400-e29b-41d4-a716-446655440001
Name: Another App
SDK Key: public_live_zzzzzzzz.wwwwwwww
```

**JSON mode (`--json`):**
```json
{
  "data": [
    {"id": "550e8400...", "name": "My App", "sdk_key": "public_live_..."},
    {"id": "660e8400...", "name": "Another App", "sdk_key": "public_live_..."}
  ]
}
```

## Error Handling

- 401 → "Not authenticated. Run `adapty auth login` first."
- 403 → "Developer API is not available for your account."
- 400 with `error_code` → show domain error message
- Network errors → "Could not reach Adapty API. Check your connection."
- `--json` mode: errors also as JSON `{"error": "...", "error_code": "..."}`

## Tech Stack

- **oclif v4** — command framework (already scaffolded)
- **TypeScript** — strict mode, ESM
- **Native fetch** — HTTP client
- **No additional runtime deps** if possible (open, inquirer only if needed for interactive prompts)

## Resolved Questions

1. **Interactive prompts for create commands?** No — all flags required. No inquirer dependency. Fail with usage help if missing.
2. **Token refresh/expiry handling?** Let 401 happen. CLI suggests `adapty auth login` on auth failure. No proactive expiry checks.
3. **`--app` flag format?** UUID only. Users get UUID from `adapty apps list`. No name lookup.
