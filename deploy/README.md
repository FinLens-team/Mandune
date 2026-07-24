# Mandong single-host deployment

This directory defines the Demo V1 deployment contract: one Node 22 process,
one local SQLite database, systemd supervision, and an HTTPS Nginx reverse
proxy. The application always binds `127.0.0.1:8787`; only Nginx is public.

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
| `/var/lib/mandong` | `mandong:mandong`, `0700` | SQLite database/WAL/SHM |
| `/var/backups/mandong` | `root:root`, `0700` | Pre-migration and rollback-guard snapshots |
| `/etc/mandong/mandong.env` | `root:root`, `0600` | Optional server-only secrets/config |
| `/etc/mandong/release.env` | `root:root`, `0600` | Generated commit SHA and migration path |

Do not put `HOST`, `PORT`, `APP_VERSION`, `MANDONG_DB_PATH`, or
`MANDONG_MIGRATIONS_DIR` in `mandong.env`; the unit and release transaction own
them. Never use `VITE_*` for model or provider credentials. The installer does
not print environment values, and Nginx request/error logging is disabled so
Cookies, query strings, and private payloads cannot enter proxy logs.

## Validate and install host configuration

Run repository-local validation first:

```sh
./deploy/validate.sh
```

The command always checks shell/config invariants. It prints `NOT RUN` instead
of claiming success when `systemd-analyze` or the Nginx/OpenSSL rendering tools
are unavailable. On the target host all checks must run.

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
immutable release directories.

## Build a candidate

Use a clean, committed candidate and a full 40-character commit SHA. The build
script uses the lockfile, rejects public client `.map` files, and creates a
stable archive plus SHA-256 file.

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

The transaction is serialized with `flock`. It validates the archive and
installs production dependencies before stopping the active service. With the
service stopped it runs SQLite `integrity_check`, creates a consistent
pre-migration `.backup`, switches the `current` symlink, starts the candidate,
and requires `/health` to return the exact candidate SHA. Any candidate health
failure stops it, restores the old symlink and its corresponding pre-migration
database snapshot, then verifies the old SHA. If recovery health also fails,
the service remains stopped (fail closed).

After release, verify both local and public paths without sending a workspace
Cookie:

```sh
curl --fail --silent http://127.0.0.1:8787/health
curl --fail --silent https://demo.example.com/health
sudo systemctl is-active mandong.service nginx.service
sudo ss -ltnp | grep -E ':(443|8787)\b'
```

The Node listener must be `127.0.0.1:8787`, never `0.0.0.0:8787` or
`[::]:8787`. Public acceptance, browser matrices, and 180-second task cleanup
remain separate release evidence; a successful liveness check does not prove
those product behaviors.

## One-step rollback

Rollback uses the active release metadata and only targets its immediate
predecessor:

```sh
sudo ./deploy/scripts/rollback.sh
```

Before changing anything it takes a rollback-guard snapshot of the current
database. It then restores the target release's pre-migration snapshot and
requires the target SHA from `/health`. If target health fails, it restores the
original release, original database, and original SHA health. If that recovery
also fails, the service remains stopped. Never delete a release, metadata file,
or database snapshot until its rollback window is intentionally closed.

## Operational checks

```sh
sudo nginx -t
sudo systemd-analyze verify /etc/systemd/system/mandong.service
sudo sqlite3 /var/lib/mandong/mandong.sqlite3 'PRAGMA integrity_check;'
sudo systemctl show mandong.service \
  -p User -p Group -p ProtectSystem -p ProtectHome -p NoNewPrivileges
```

Do not use `journalctl` exports as public acceptance artifacts until they have
been audited for credentials and private payloads. The application currently
logs only startup information, but deployment must not assume future handlers
will remain log-free.
