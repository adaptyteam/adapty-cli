---
name: adapty-cli-setup
license: MIT
description: Use when the Adapty CLI needs installing or authenticating before any Apple Search Ads work — a fresh Cowork or cloud session, "adapty: command not found", AuthRequiredError, an expired auth code, or connecting an Apple Search Ads account. Triggers on "install the Adapty CLI", "set up adapty", "adapty auth login", "connect Apple Search Ads", "not authenticated", or any Apple Ads request made in a session where the CLI is not yet installed.
---

# Adapty CLI setup

Get from a blank machine to `adapty asa whoami` printing a company with Apple connected. Then hand
off to `apple-ads`. Nothing here spends money.

**A cloud session starts on a clean machine.** No CLI, no token, no config — nothing carries over
from a previous session, and nothing in this one carries into the next. Never skip the run because
setup "was already done".

## Entry boundary

Open this skill only when `adapty` is missing, `adapty asa whoami` returns
`AuthRequiredError`, or Apple credentials need connecting. A failed preflight is not automatically
an authentication failure:

- `402 ads_manager_subscription_required` means authentication succeeded. Do not install or log in.
- `NetworkError` means the CLI could not reach the API. Do not install or log in.
- Repeated `failed to copy trust settings of system certificate-25291` lines mean a macOS sandbox
  cannot read the system Keychain. The caller must suppress those lines, retry the same read once
  with `NODE_USE_SYSTEM_CA=0`, then retry that read once outside the sandbox when the platform
  explicitly supports it. Never route either failure into this setup flow.

If both network retries fail, stop with exactly this user-facing message and no certificate dump:

> Adapty API is unreachable from this sandbox. Allow network access for `adapty.io` and
> `*.adapty.io`, then start a new task.

## Run this

Two scripts do the whole job. Run step 1, surface what it prints, run step 2. Do not improvise
around them and do not hand-roll the install or the login.

**Step 1 — install the latest CLI and start auth.** Run this whole block as one command:

```bash
set -u; D=${TMPDIR:-/tmp}/adapty-setup; mkdir -p $D
npm install -g adapty@latest >$D/npm.log 2>&1 || { npm config set prefix ~/.npm-global; export PATH=~/.npm-global/bin:$PATH; npm install -g adapty@latest >>$D/npm.log 2>&1; }
GB="$(npm prefix -g 2>/dev/null)/bin"; [ -d "$GB" ] && export PATH="$GB:$PATH"; adapty --version
OUT=$(timeout 30 adapty asa whoami 2>&1); RC=$?
if [ $RC -eq 0 ]; then echo "$OUT"; echo READY_AUTHED; exit 0; fi
case "$OUT" in *ads_manager_subscription_required*|*402*) echo "$OUT"; echo READY_AUTHED_NO_SUB; exit 0;; esac
rm -f $D/auth.out $D/auth.pid; setsid nohup bash -c 'echo $$ > "$1"; exec adapty auth login' _ $D/auth.pid >$D/auth.out 2>&1 </dev/null
for i in $(seq 1 20); do [ -s $D/auth.pid ] && break; sleep 0.2; done
for i in $(seq 1 40); do grep -q 'code=' $D/auth.out && break; sleep 0.5; done
U=$(grep -o 'https://[^ ]*code=[A-Za-z0-9-]*' $D/auth.out | head -1)
ps -p $(cat $D/auth.pid) >/dev/null && echo "NEED_AUTH url=$U code=${U##*code=} pid=$(cat $D/auth.pid)" || echo ERROR waiter_died
```


It installs `adapty@latest`, retries with a user prefix on `EACCES`, puts the global bin dir on
`PATH`, verifies the `asa` topic exists, kills any waiter left from an earlier attempt, and ends in
exactly one status line:

| Status line | What to do |
| --- | --- |
| `READY_AUTHED` | Already authenticated. Skip to **Apple connection** below. |
| `READY_AUTHED_NO_SUB` | Authenticated, but the company has no Ads Manager subscription. Setup is **done** — do not mint a code. Say so and stop; see the `402` row in **Failure modes**. |
| `NEED_AUTH url=<url> code=<code> pid=<pid>` | **Surface the url and code to the user immediately**, then run step 2. |
| `ERROR <reason>` | Read the reason against **Failure modes** below. Do not retry blindly. |

This is the single-file edition: the commands are inline, so there are no script files to locate.

**On `NEED_AUTH`, sending the link is the very next thing you do — before any other tool call, any
summary, any commentary.** The code is minted server-side when the script starts and expires within
minutes; every second between minting and the user clicking is spent against that TTL. Post the full
clickable URL and the code as its own short message, not buried in a paragraph.

**Step 2 — wait for approval and confirm.** Poll authentication state, never a process. This block
returns after ~30s on purpose — run it again on `STILL_WAITING` rather than lengthening it, because a
tool call that times out and gets killed can take the auth waiter down with it:

```bash
D=${TMPDIR:-/tmp}/adapty-setup
for i in $(seq 1 10); do
  OUT=$(timeout 30 adapty asa whoami 2>&1); RC=$?
  if [ $RC -eq 0 ] && [ -n "$OUT" ]; then echo "$OUT"; echo AUTHED; exit 0; fi
  case "$OUT" in *ads_manager_subscription_required*|*402*) echo "$OUT"; echo AUTHED_NO_SUB; exit 0;; esac
  grep -qi 'expired\|not found\|invalid' $D/auth.out 2>/dev/null && { echo EXPIRED; exit 0; }
  ps -p $(cat $D/auth.pid 2>/dev/null) >/dev/null 2>&1 || { sleep 4; timeout 30 adapty asa whoami 2>/dev/null && echo AUTHED || echo EXPIRED; exit 0; }
  sleep 3
done
echo STILL_WAITING
```

| Status line | What to do |
| --- | --- |
| `AUTHED` | Account details are printed above it. Continue to **Apple connection**. |
| `AUTHED_NO_SUB` | Authenticated; no Ads Manager subscription. Setup is done. Stop and say so. |
| `STILL_WAITING` | The user has not clicked yet. Run step 2 again. **Never mint a new code while the old waiter is alive** — that invalidates the link they are about to click. |
| `EXPIRED` | The code is dead. Go back to step 1 for a fresh code; the old one is not reusable. |

**One link per session is the target.** `EXPIRED` arriving within seconds of `NEED_AUTH`, before the
user could plausibly have clicked, is a bug signal rather than a real expiry — the user has been
given a link that still works. Say what happened and ask whether they clicked it before you mint
anything; a second link makes the first one they were about to click the wrong one. Repeat step 2
instead. Only a genuine `STILL_WAITING` timeout, or a server rejection, justifies a new code.

## Apple connection

`asa whoami` reports `Apple Credentials Status`. If it is not active:

```bash
adapty asa connect            # prints the authorization link and waits
adapty asa connect --no-wait  # prints and returns immediately
```

Use `--no-wait` when the person authorizing Apple is not the one at this session, then confirm with
`adapty asa whoami` rather than assuming the link was followed.

Apple authorization belongs to a **company**, not a user. Every `asa` command is scoped to the
token's company and there is no `--app` to switch it, so a `404` on an object that plainly exists in
the dashboard usually means the token is scoped elsewhere.

## Failure modes

| What you see | What it means | What to do |
| --- | --- | --- |
| `ERROR node_missing` / `node_too_old` | Node.js below 18 | Install Node 18+; nothing else will work |
| `ERROR npm_install_failed`, log shows a network, DNS or registry error | **In Cowork or any sandbox: egress is off, or the domains are not allowlisted.** The most common cloud failure, and not fixable from the shell | Settings → Capabilities → enable code execution → allow network egress → an access mode that permits package managers → add **both** `adapty.io` and `*.adapty.io` (a wildcard does not cover the apex domain). **Settings apply when a task starts**, so after changing them the user must start a new task; changing them mid-conversation does nothing |
| `ERROR npm_install_failed`, log shows `EACCES` or a write error | Install failed even with a user prefix | Read `$TMPDIR/adapty-setup/npm.log`. Never re-run under `sudo` |
| `ERROR adapty_not_on_path` | Installed, but the global bin dir is not on `PATH` | Export the path the error prints |
| `ERROR asa_topic_missing` | CLI older than 0.4.0 | `npm install -g adapty@latest` |
| `ERROR no_code_minted` | Login started but printed no code | Read `$TMPDIR/adapty-setup/auth.out` |
| `User code not found or expired` in the browser | The waiter died, or the TTL ran out | Step 1 again, and surface the new code faster |
| `AuthRequiredError` after `AUTHED` | Almost always a stale `ADAPTY_TOKEN` | `unset ADAPTY_TOKEN`, re-check |
| `402 ads_manager_subscription_required` | Authenticated fine; the company has no Ads Manager subscription | **Not a setup bug.** Say so plainly and stop. No flag works around it |
| `NetworkError`, including certificate `-25291` noise | Network or sandbox trust-store access failed before authentication could be checked | Return to the caller's quiet preflight retry. Never install or log in |

## ADAPTY_TOKEN

`ADAPTY_TOKEN` is read **before** the stored config and wins outright when set. Two consequences:

- A stale exported token silently overrides a fresh `auth login`, so unset it before debugging any
  auth failure that makes no sense.
- It dies with the shell. A token that works in one command and not the next was never exported, or
  was exported in a different process.

`adapty auth login` works in a cloud session — the browser can be anywhere. **Never tell the user
browser login is unavailable here, and never ask them for a token because the session is remote.**
A token is something they may volunteer; it is never something you request as a substitute for
printing the link.

## Never

- **Never ask for a token, or part of one.** A truncated token authenticates nothing. Comparing the
  last four characters of two tokens is a debugging trick for spotting a stale `ADAPTY_TOKEN`, not an
  input to any command.
- **Never mint a second code while the first waiter is alive.** It kills the link the user is
  clicking.
- **Never trust `pgrep -f` to tell you the waiter is alive** — it matches your own shell wrapper.
  Use `ps -p <pid>`.
- **Never treat a dead pid as proof the code expired.** Authentication state is the signal: a
  successful `adapty asa whoami` means authenticated no matter what any process is doing, and a pid
  can be recorded wrong. `$!` after `setsid` is setsid's own pid, and setsid exits the instant it
  forks — capture the pid from inside the child (`echo $$` before `exec`) instead.
- **Never print a second authorization link without saying why.** Two live links means the user
  clicks the wrong one.
- **Never treat `adapty auth status` as proof of a working token.** It never touches the network;
  `adapty asa whoami` is the first call that asks the server.
- **Never present a `402` as a broken install**, and never hunt for a flag that bypasses it.
- **Never present a `NetworkError` as an authentication or install failure.** In particular, do not
  reset Keychain, reinstall Xcode, run `sudo`, reinstall the CLI, or start `auth login` for
  certificate `-25291` noise.
- **Never echo a full token into chat**, and never write one into a file that could be committed.
- **Never run a write command from this skill.** Setup is reads plus `asa connect`. A campaign, bid,
  budget or keyword means `apple-ads` owns the next step.

## Handing off

Once `asa whoami` shows a company and active Apple credentials, setup is done — say so in one line.

Anything past that point belongs to Apple Search Ads proper, and **this skill deliberately does not
cover it.** If the `apple-ads` skill is installed, open it: it carries the rules that keep a write
from costing money by accident — `--idempotency-key` per write, the scope-filter matrix for lists, 15
keywords per call, the shared analytics budget, and the rule that `--yes` never goes on a command the
user runs themselves.

If `apple-ads` is **not** installed, say so before running anything that writes. Reads
(`metrics`, any `list`, `whoami`) are safe to do directly. But every `asa` write reaches Apple within
seconds, spends real money, and cannot be undone — there is no delete in the `asa` surface and
`--status PAUSED` is the only stop. Do not reconstruct those rules from memory; get the skill, or
hand the user the command to run themselves without `--yes` so the CLI shows them the request body
first.

`apple-ads` ships in the same plugin as this skill:
https://github.com/adaptyteam/apple-ads-cli
