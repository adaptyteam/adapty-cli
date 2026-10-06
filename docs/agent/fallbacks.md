# Fallbacks — Download the Fallback File

The Adapty SDK reads a bundled fallback file when the Adapty backend is unreachable, so the app can still show
paywalls, onboardings and flows. The `fallbacks` topic downloads that file for a CI step that runs before every
release build. It is read-only and uses the same login as the rest of the CLI; in CI, set `ADAPTY_TOKEN`.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `fallbacks get` | `--app`, `--platform` (`ios`/`android`), `--sdk-version` (`X.Y.Z`) required; `--output <file>` optional | One file per store, covering every placement of the app: `ios` is the App Store file, `android` the Play Store file. The CLI streams the server's bytes unparsed, so memory stays flat (a large app's file is about 200 MB). Without `--output`, stdout is the file byte for byte in human mode and with `--json`, and nothing else is printed there: every error, the `--json` error object included, goes to stderr. With `--output`, the file is written atomically after a complete download, and `--json` returns `{path, platform, sdk_version, bytes}` instead of the file. |

## Which `--sdk-version`

Pass the Adapty SDK version the app is built with; for Flutter, React Native and Unity, the Adapty plugin version.
The server picks the file format from it, and the SDK accepts only the one format it was built for: it rejects any
other file at startup. The CLI keeps no list of versions; the server maps any `X.Y.Z`. The latest mappings:

| `--sdk-version` | file format (`meta.version`) |
|---|---|
| 4.1.0 and later | 11 |
| 4.0.x | 10 |
| 3.12.x and later 3.x | 9 |
| 3.8.x – 3.11.x | 8 |

## Writing the file safely

A plain `> file` truncates the file before the request runs, so a failed request leaves an empty file. Write to
a temp file and move it only on success, or use `--output`:

```sh
adapty fallbacks get --app APP_UUID --platform ios --sdk-version 4.1.0 > ios_fallback.json.tmp && mv ios_fallback.json.tmp ios_fallback.json
adapty fallbacks get --app APP_UUID --platform android --sdk-version 4.1.0 --output Assets/StreamingAssets/android_fallback.json
```

`--output` creates missing parent directories and keeps the old file on any failure: a rejected request, a lost
connection, an answer that is not the file, or a failed write. A download that breaks halfway is retried like a
5xx. Use it on Windows, where PowerShell 5.1 `>` writes UTF-16. On stdout a download that breaks halfway leaves a
partial file and exits 5.

Without `--output`, read errors from stderr and the exit code, never from stdout: under `--json` the error object
goes to stderr too, whether it comes before the first byte of the file (a bad flag, a 403, a lost connection, an
answer that is not the file) or after it. With `--output`, stdout is not the file, and the `--json` error object
is on stdout as for every other command.

## Exit codes

`2` bad input (an app id that is not a UUID, a `--sdk-version` that is not `X.Y.Z`, another `--platform`),
checked before any request. `3` no token, or the API refused the token or the app (`403 authentication_failed`,
`403 permission_denied`). `4` another API error, or an answer that is not shaped like the file: not
`application/json`, or a body whose first and last non-whitespace bytes are not `{` and `}`
(`fallback_invalid_response`). `5` the API was not reached, or the download broke halfway. `1` the file could not
be written; the message names the errno.
