# Mandune single-host deployment

This directory defines the Mandune single-host deployment contract: one Node 22 process,
one local SQLite database, systemd supervision, and an HTTPS Nginx reverse
proxy. The production service binds `127.0.0.1:8791`; only Nginx is public.
Local development keeps the application default `127.0.0.1:8787`.

## Host prerequisites

- A Linux host with systemd and Nginx.
- Node 22.22.1 and Corepack with pnpm 10.33.2 at explicit, persistent paths.
- `curl`, GNU `tar`, `sha256sum`, `sqlite3`, `flock`, `envsubst`, and OpenSSL.
- A DNS name and existing TLS certificate/key readable by root and Nginx.
- Root access for host installation, release, and rollback.

The host layout is fixed:

| Path | Owner/mode | Purpose |
| --- | --- | --- |
| `/opt/mandong/releases/<commit-sha>` | `root:mandong`, no world access | Immutable application releases |
| `/opt/mandong/current` | root-managed symlink | Active release |
| `/opt/mandong/runtime` | `root:root`, `0755` | Validated Node/Corepack symlinks used by systemd and release scripts |
| `/var/lib/mandong` | `mandong:mandong`, `0700` | SQLite database/WAL/SHM and mutable runtime state |
| `/var/lib/mandong/daily-briefings` | `mandong:mandong`, `0700` | Dated and `latest/` daily briefing JSON |
| `/var/backups/mandong` | `root:root`, `0700` | Pre-migration and rollback-guard snapshots |
| `/etc/mandong/mandong.env` | `root:root`, `0600` | Optional server-only secrets/config |
| `/etc/mandong/release.env` | `root:root`, `0600` | Generated commit SHA and migration path |
| `/etc/systemd/system/mandong-purge.*` | `root:root`, `0644` | Hardened daily private-workspace expiry job |
| `/etc/systemd/system/mandong-daily-briefing.*` | `root:root`, `0644` | Hardened 08:00 Asia/Shanghai briefing job |
| `/run/lock/mandong/maintenance.lock` | `root:mandong`, `0660`; root-managed `0750` parent | Shared release/rollback/purge transaction lock |

Do not put `HOST`, `PORT`, `APP_VERSION`, `MANDONG_DB_PATH`, or
`MANDONG_MIGRATIONS_DIR` in `mandong.env`; the unit and release transaction own
them. Never use `VITE_*` for model or provider credentials. The installer does
not print environment values, and Nginx request/error logging is disabled so
Cookies, query strings, and private payloads cannot enter proxy logs.

The optional A2A deep-review interface reads only server-side values from
`/etc/mandong/mandong.env`:

```dotenv
ARK_API_KEY=<one-protected-competition-token>
A2A_BEARER_TOKEN=<independent-opaque-token-at-least-24-characters>
A2A_PUBLIC_BASE_URL=https://demo.example.com
```

Setting any A2A value without both credentials fails startup. The public base
URL is an origin, not a path. The server fixes the Ark OpenAI-compatible base
URL to `https://ark.cn-beijing.volces.com/api/v3` and the DeepSeek-Pro endpoint
ID to `ep-20260708162855-pcf9x`; `ARK_BASE_URL` is only an optional controlled
gateway/local-test override. The model key and caller token must be different,
must remain `root:root 0600`, and must never be passed in a URL or copied into
an Agent Card. Nginx keeps the browser path at 210 seconds and gives only
`/a2a/` a 930-second transport margin for the Agent's 900-second deadline.

## Validate and install host configuration

Run repository-local validation first:

```sh
./deploy/validate.sh
```

The command always checks shell/config invariants and exercises the release
archive validator with traversal, control-character, link, FIFO, device,
duplicate, and required-type faults. Device-fixture construction is mandatory:
the validation fails rather than silently skipping that case. It also runs a
bounded shared-lock contention test, SQLite-backed rollback recovery faults,
and two full same-commit builds with different untracked Vite `public/` inputs.
The archives must be byte-identical and exclude the untracked input. It prints
`NOT RUN` instead of claiming success when `systemd-analyze` or the Nginx/OpenSSL
rendering tools are unavailable. On the target host all checks must run.

Install the unit and Nginx config without starting Mandong:

```sh
sudo env \
  MANDONG_NODE_BIN=/usr/local/lib/node-v22.22.1-linux-x64/bin/node \
  MANDONG_COREPACK_BIN=/usr/local/lib/node-v22.22.1-linux-x64/bin/corepack \
  MANDONG_NGINX_BIN=/www/server/nginx/sbin/nginx \
  MANDONG_NGINX_VHOST_PATH=/www/server/panel/vhost/nginx/demo.example.com.conf \
  MANDONG_SERVER_NAME=demo.example.com \
  MANDONG_TLS_CERTIFICATE=/etc/letsencrypt/live/demo.example.com/fullchain.pem \
  MANDONG_TLS_CERTIFICATE_KEY=/etc/letsencrypt/live/demo.example.com/privkey.pem \
  ./deploy/scripts/install-host.sh
```

The installer resolves and validates the explicitly selected Nginx binary, then
runs that binary's `-t` before keeping the selected vhost path. This matters on
hosts where the active Nginx is not the distribution `/usr/sbin/nginx`. A
failed Nginx validation or reload restores the previous
config. It validates the exact Node/pnpm versions and atomically pins their
resolved entrypoints under `/opt/mandong/runtime`; the service never falls back
to another `node` on the host PATH. It never starts or restarts
`mandong.service`. The unit uses `--preserve-symlinks-main` so the ESM entrypoint
guard remains valid while `/opt/mandong/current` is switched atomically between
immutable release directories. It installs and runs `systemctl enable --now` for both
`mandong-purge.timer` and `mandong-daily-briefing.timer`; the application service
itself remains enabled but is not started by host installation. The purge timer
is persistent and has a 45-minute randomized delay. The daily
briefing timer is persistent, runs at `08:00 Asia/Shanghai`, and has a five-minute
randomized delay. Before the first release, `ConditionPathExists` makes both
oneshot jobs a clean no-op rather than a failed unit. The daily briefing worker
collects public Tencent index candles plus bounded, citable market or macro news
through the isolated AKShare Eastmoney/10jqka adapters, generates seven theme
copies through the server-only model gateway, validates shared facts, and atomically publishes to
`/var/lib/mandong/daily-briefings/latest`; it never writes the release/source
tree. The purge service has no network namespace and can only write the Mandong
state directory. A tmpfiles rule recreates the shared lock after boot
with a root-owned parent, so the service user can open the lock but cannot
replace it. Installation fails unless the parent is `root:mandong 0750` and the
regular lock file is `root:mandong 0660`.

## Build a candidate

Use a full 40-character commit SHA for the checked-out candidate. The script
exports that exact commit into an isolated temporary tree before installing or
building, so worktree edits and untracked build inputs cannot alter the archive
for that SHA. It rejects output paths inside archived source directories, uses
the lockfile, removes the isolated tree's entire `dist` before building, rejects
public client `.map` paths, normalizes tar metadata and gzip headers, and writes
the archive plus SHA-256 from staged files. The isolated build tree and staging
files are removed on success or failure.

```sh
commit_sha="$(git rev-parse HEAD)"
./deploy/scripts/create-release.sh \
  "$commit_sha" "/tmp/mandong-${commit_sha}.tar.gz"
```

Transfer the archive and its checksum through the normal protected release
channel. Do not place credentials or private portfolio data in the archive.

## Release

Read the expected digest from the transferred `.sha256` file, verify it out of
band, and run:

```sh
sudo ./deploy/scripts/release.sh \
  "/tmp/mandong-${commit_sha}.tar.gz" \
  "$commit_sha" \
  "$expected_sha256"
```

The transaction takes `/run/lock/mandong/maintenance.lock` with a 30-second
bounded `flock`. Purge and rollback use the same lock, so lock timeout fails
explicitly instead of allowing concurrent SQLite mutation. Before root
extraction the release script reads an
escaped GNU tar manifest and accepts only unique regular files/directories under
`dist`, `migrations`, `package.json`, and `pnpm-lock.yaml`. Absolute, dot-segment,
control/backslash, unexpected, symlink, hardlink, device, FIFO, and wrong
required-type entries are rejected. A second tree walk repeats type, hardlink,
required-path, allowlist, and source-map checks after extraction. Only then are
production dependencies installed and the active service stopped. With the
service stopped the script runs SQLite `integrity_check`, creates a consistent
pre-migration `.backup`, switches the `current` symlink, starts the candidate,
and requires `/health` to return the exact candidate SHA. Any candidate health
failure stops it, restores the old symlink and its corresponding pre-migration
database snapshot, then verifies the old SHA. If recovery health also fails,
the service remains stopped (fail closed).

After release, verify both local and public paths without sending a workspace
Cookie:

```sh
curl --fail --silent http://127.0.0.1:8791/health
curl --fail --silent http://127.0.0.1:8791/daily-briefings/latest/eastern_observation.json
curl --fail --silent https://demo.example.com/health
curl --fail --silent https://demo.example.com/.well-known/agent-card.json
sudo systemctl is-active mandong.service nginx.service
sudo systemctl is-active mandong-purge.timer mandong-daily-briefing.timer
sudo ss -ltnp | grep -E ':(443|8791)\b'
```

The production Node listener must be `127.0.0.1:8791`, never `0.0.0.0:8791` or
`[::]:8791`. Public acceptance, browser matrices, and 180-second task cleanup
remain separate release evidence; a successful liveness check does not prove
those product behaviors.

## One-step rollback

Rollback uses the active release metadata and only targets its immediate
predecessor:

```sh
sudo ./deploy/scripts/rollback.sh
```

Before changing anything it takes the shared maintenance lock and a
rollback-guard snapshot of the current live database. It switches only the
application release and starts the target
against that same live database, so a successful rollback preserves every
workspace and history write made by the current release. The target must return
its exact SHA from `/health`; an old release that cannot open the current schema
fails closed instead of receiving an older database snapshot. On any target
activation, startup, schema, or health failure, rollback stops the target,
reactivates the original release, restores the guard database, and verifies the
original SHA. If that recovery also fails, the service remains stopped. The
pre-migration snapshot remains reserved for automatic recovery from a failed
forward release. Never delete a release, metadata file, or database snapshot
until its rollback window is intentionally closed.

## Expired-workspace purge

The production release contains the compiled maintenance entrypoint. It does
not depend on `tsx` or any other development dependency:

```sh
sudo systemctl status mandong-purge.timer
sudo systemctl list-timers mandong-purge.timer
sudo systemctl start mandong-purge.service
sudo systemctl show mandong-purge.service \
  -p User -p PrivateNetwork -p ProtectSystem -p ReadWritePaths
```

The oneshot loads the same generated release environment as the application and
runs the compiled purge under a 30-second bounded exclusive lock using
`node --preserve-symlinks-main
/opt/mandong/current/dist/persistence/maintenance.js purge-expired`. Output is
limited to aggregate purge/failure counts. `Persistent=true` catches a missed
daily run after host downtime; the randomized delay avoids a fixed thundering
start. Lock timeout exits with status 75; any nonzero exit leaves a failed unit
for operator inspection and retry. `ReadOnlyPaths` prevents the oneshot from
modifying the root-managed lock inode.

## Operational checks

```sh
sudo nginx -t
sudo systemd-analyze verify /etc/systemd/system/mandong.service
sudo systemd-analyze verify /etc/systemd/system/mandong-purge.service /etc/systemd/system/mandong-purge.timer
sudo systemd-analyze verify /etc/systemd/system/mandong-daily-briefing.service /etc/systemd/system/mandong-daily-briefing.timer
sudo systemctl list-timers mandong-purge.timer mandong-daily-briefing.timer
sudo sqlite3 /var/lib/mandong/mandong.sqlite3 'PRAGMA integrity_check;'
sudo systemctl show mandong.service \
  -p User -p Group -p ProtectSystem -p ProtectHome -p NoNewPrivileges
sudo stat -c '%U:%G:%a %n' /run/lock/mandong /run/lock/mandong/maintenance.lock
```

Do not use `journalctl` exports as public acceptance artifacts until they have
been audited for credentials and private payloads. The application currently
logs only startup information, but deployment must not assume future handlers
will remain log-free.
