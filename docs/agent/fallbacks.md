# Fallbacks — Download the Fallback File

The Adapty SDK reads a bundled fallback file when the Adapty backend is unreachable, so the app can still show
paywalls, onboardings and flows. The `fallbacks` topic downloads that file for a CI step that runs before every
release build. It is read-only and uses the same login as the rest of the CLI; in CI, set `ADAPTY_TOKEN`.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `fallbacks get` | `--app`, `--platform` (`ios`/`android`), `--sdk-version` (`X.Y.Z`) required; `--output <file>` optional | One file per store, covering every placement of the app: `ios` is the App Store file, `android` the Play Store file. `--sdk-version` is the Adapty SDK version in the app; the server picks the file format from it (`4.1.0` and later give `meta.version` 11). Without `--output`, stdout is the file itself in human mode and with `--json`, and nothing else is printed there. With `--output`, the file is written atomically after a successful download, and `--json` returns `{path, platform, sdk_version, meta_version, placements, bytes}` instead of the file. |

## Writing the file safely

A plain `> file` truncates the file before the request runs, so a failed request leaves an empty file. Write to
a temp file and move it only on success, or use `--output`:

```sh
adapty fallbacks get --app APP_UUID --platform ios --sdk-version 4.1.0 > ios_fallback.json.tmp && mv ios_fallback.json.tmp ios_fallback.json
adapty fallbacks get --app APP_UUID --platform android --sdk-version 4.1.0 --output Assets/StreamingAssets/android_fallback.json
```

`--output` creates missing parent directories and keeps the old file on any failure: a rejected request, a lost
connection, or a failed write. Use it on Windows, where PowerShell 5.1 `>` writes UTF-16.

## Exit codes

`2` bad input (an app id that is not a UUID, a `--sdk-version` that is not `X.Y.Z`, another `--platform`), checked
before any request. `3` no token, or the API refused the token or the app (`403 authentication_failed`,
`403 permission_denied`). `4` another API error. `5` the API was not reached. `1` the file could not be written;
the message names the errno.
