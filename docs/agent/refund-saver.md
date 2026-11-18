# Refund Saver — Switch, Preferences, Readiness, Profiles, Requests, Metrics

The `refund-saver` topic manages Refund Saver of one app: whether it answers the refund requests of the stores, the
refund preference of each store, the settings of one profile, and what it handled and saved. It talks to the
Developer API with the same developer token as the rest of the CLI. Every command takes `--app` (the app UUID from
`adapty apps list`) and prints the API answer with `--json`.

Refund Saver is a paid add-on. The account owner manages it in Billing in the Adapty dashboard, not with the CLI.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `refund-saver get` | `--app` | `enabled` (true when Refund Saver is on in either store) and `stores`: the App Store preference and `refund_saver_needs_consent`, the Play Store preference. |
| `refund-saver on` | `--app` | Turns Refund Saver on in both stores. The API can refuse `on` with 409 (exit 4); the codes are below. `on` answers with a note (`billing_note` in `--json`), also when the app is on already; the CLI prints it. An app that is on already answers its state. |
| `refund-saver off` | `--app` | Turns Refund Saver off in both stores; `billing_note` is null. Turning Refund Saver off does not cancel the Refund Saver add-on. The account owner manages it in Billing in the Adapty dashboard. |
| `refund-saver update` | `--app`; at least one of `--app-store-preference`, `--needs-consent` / `--no-needs-consent`, `--play-store-preference` | Changes only the given settings and answers `stores`. Play Store has no `always_prorated`. It does not turn Refund Saver on or off. |
| `refund-saver readiness` | `--app` | `app_store` and `play_store`: true when the store credentials that Refund Saver needs are set. App Store: the bundle ID and the App Store Connect API key ID, issuer ID and private key. Play Store: the bundle ID and the service account key. The human view names the missing setup of each store that is not ready. |
| `refund-saver profile get <profile_id>` | `--app` | `custom_preference` and `consent` of one profile (the Adapty profile ID, not the customer user ID); `null` when not set. A profile that is not in the app is `404 profile_not_found`. |
| `refund-saver profile update <profile_id>` | `--app`; at least one of `--custom-preference`, `--consent` / `--no-consent` | Changes only the given setting and answers both. |
| `refund-saver requests` | `--app`, `--date-from`, `--date-to` required; `--store`, `--page`, `--page-size` optional | The refund requests handled in the period, newest first: `status`, `store_transaction_id`, `store_product_id`, `profile_id`, `customer_user_id`, `country_name`, `amount_usd`, `refund_reason`, `received_at`, `updated_at`, with `meta.pagination`. A page after the last is an empty page. |
| `refund-saver metrics` | `--app`, `--date-from`, `--date-to` required; `--store` optional | `saved_amount_usd`, `saved_count`, `requested_amount_usd`, `requested_count` (amounts in whole USD) and `win_rate` (a percent as text, one decimal). |

The dates are UTC days on the date the request was handled, both inclusive. A reversed range is an empty answer, not
an error. `--store` takes `app_store` or `play_store`.

```sh
adapty refund-saver readiness --app APP_UUID
adapty refund-saver on --app APP_UUID --json
adapty refund-saver update --app APP_UUID --app-store-preference always_decline --no-needs-consent
adapty refund-saver requests --app APP_UUID --date-from 2026-10-01 --date-to 2026-10-31 --store app_store --json
```

## Refusals of `on`

The API can refuse `on` with 409 (exit 4). A refusal changes nothing; read `error.code` in `--json`:

- `refund_saver_addon_inactive`: the Refund Saver add-on is not active for this account; ask the account owner to
  turn it on in Billing in the Adapty dashboard, then retry.
- `refund_saver_apple_credentials_invalid`: the Apple credentials of this account do not work; fix them in App
  settings in the Adapty dashboard, then retry.
- `refund_saver_addon_unavailable`: Refund Saver cannot be turned on for this account; do not retry, contact Adapty
  support.

## Errors

Bad input exits 2 before anything is sent: the app or profile UUID, a date that is not `YYYY-MM-DD`, an unknown
preference or store, and `update` or `profile update` with no setting. A server refusal exits 4 with its error code
and the field it names. A missing token, an app the token cannot access, or an account without edit rights on `on`,
`off`, `update` and `profile update` exits 3.

## Edit rights

`on`, `off`, `update` and `profile update` need edit rights in the company that owns the app. An account that can
view the app but not change it gets 403 `edit_rights_required` (exit 3), and nothing changes. Do not retry until a
company owner or admin grants edit rights. An app of another company is 403 `permission_denied`, also exit 3.
