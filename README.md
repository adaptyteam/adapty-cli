# adapty-cli

CLI for the [Adapty Developer API](https://docs.adapty.io/docs/developer-api). Manage apps, products, paywalls, placements, and access levels from your terminal.

## Installation

```sh
npm install -g adapty-cli
```

Requires Node.js >= 18.

## Authentication

```sh
adapty auth login
```

Opens browser for OAuth device flow. Token is stored in `~/.config/adapty/config.json`.

Override with `ADAPTY_TOKEN` environment variable:

```sh
ADAPTY_TOKEN=your-token adapty apps list
```

Other auth commands:

```sh
adapty auth whoami     # verify token, show user info
adapty auth status     # show local auth state
adapty auth logout     # clear stored token (local only)
adapty auth revoke     # revoke token server-side and clear local
```

## Commands

All resource commands require `--app APP_ID` (UUID). Use `adapty apps list` to find your app ID.

### Apps

```sh
adapty apps list [--page N] [--page-size N]
adapty apps get APP_ID
adapty apps create --title "My App" --platform ios --apple-bundle-id com.example.app
adapty apps update APP_ID [flags]
```

### Products

```sh
adapty products list --app UUID [--page N] [--page-size N]
adapty products get --app UUID PRODUCT_ID
adapty products create --app UUID [flags]
adapty products update --app UUID PRODUCT_ID [flags]
```

### Paywalls

```sh
adapty paywalls list --app UUID [--page N] [--page-size N]
adapty paywalls get --app UUID PAYWALL_ID
adapty paywalls create --app UUID --title "Name" --product-id UUID1 [--product-id UUID2]
adapty paywalls update --app UUID PAYWALL_ID [flags]
```

### Placements

```sh
adapty placements list --app UUID [--page N] [--page-size N]
adapty placements get --app UUID PLACEMENT_ID
adapty placements create --app UUID [flags]
adapty placements update --app UUID PLACEMENT_ID [flags]
```

### Access Levels

```sh
adapty access-levels list --app UUID [--page N] [--page-size N]
adapty access-levels get --app UUID ACCESS_LEVEL_ID
adapty access-levels create --app UUID [flags]
adapty access-levels update --app UUID ACCESS_LEVEL_ID [flags]
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--help` | Show help |
| `--page` | Page number (default: 1) |
| `--page-size` | Items per page (default: 20, max: 100) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ADAPTY_TOKEN` | Override stored auth token |
| `ADAPTY_API_URL` | Override API base URL (default: `https://api.adapty.io/api/v1/developer`) |

## Development

```sh
pnpm install
pnpm build
./bin/run.js apps list
```

## License

MIT
