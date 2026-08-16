# Configuration

Mandune reads runtime configuration from the server process environment. Start from [`.env.example`](../.env.example), keep the resulting `.env` untracked, and never use `VITE_*` for provider or model credentials.

The `MANDONG_*` environment variables and `/opt/mandong` service paths predate the public Mandune name. They remain stable deployment interfaces for compatibility.

## Core Runtime

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Production | unset | Set to `production` to require a real model gateway and enable the secure production workspace-cookie contract |
| `HOST` | No | `127.0.0.1` | Node listener address |
| `PORT` | No | `8787` | Node listener port |
| `APP_VERSION` | No | `0.1.0` | Version returned by `/health`; production should use the commit SHA |
| `MANDONG_DB_PATH` | Production | `/var/lib/mandong/mandong.sqlite3` | Absolute SQLite path |
| `MANDONG_MIGRATIONS_DIR` | No | `<cwd>/migrations` | Absolute migration directory override |
| `MANDONG_DB_BUSY_TIMEOUT_MS` | No | `1000` | SQLite write-lock wait, from `0` to `60000` ms |
| `MANDONG_DAILY_BRIEFINGS_DIR` | No | `/var/lib/mandong/daily-briefings` | Absolute mutable directory for generated daily briefing JSON |
| `MANDONG_ANALYSIS_DEADLINE_MS` | No | `180000` | Analysis hard deadline, from `10000` to `3600000` ms |

For local development, create an ignored `.localdata` directory and set both `MANDONG_DB_PATH` and `MANDONG_DAILY_BRIEFINGS_DIR` to absolute paths inside it. The briefing directory is mutable runtime state; production jobs must not write generated files into an immutable release or source tree.

## Model Gateway

The primary model is enabled only when all three values are present:

```dotenv
MODEL_BASE_URL=https://gateway.example.com/v1
MODEL_API_KEY=replace-locally
MODEL_ID=model-name
```

Optional settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `MODEL_PROVIDER_NAME` | `model-gateway` | Human-readable provider label |
| `MODEL_SUPPORTS_STRUCTURED_OUTPUTS` | `false` | Set only after testing the provider/model pair |
| `MODEL_PROTOCOL` | `openai` | `openai` or `anthropic_messages` |

Base URLs must use HTTPS, except `localhost` and `127.0.0.1` during local testing. Model IDs cannot contain whitespace.

### Fallbacks

Define ordered fallbacks with `MODEL_FALLBACK_1_*`, then `_2_*`, up to `_8_*`. Each fallback accepts the same `BASE_URL`, `API_KEY`, `ID`, `PROVIDER_NAME`, `SUPPORTS_STRUCTURED_OUTPUTS`, and `PROTOCOL` fields. The chain stops at the first entirely absent index.

## Analysis Modes

```dotenv
MANDONG_ANALYSIS_MODE=stream
```

| Mode | Full-evidence prerequisites | Behavior |
| --- | --- | --- |
| unset / `stream` | `MODEL_*`; current AKShare runtime for the primary market path | AKShare market evidence with per-instrument Tencent fallback plus one streaming text generation |
| `v2` | `MODEL_*`, PandaAI runtime, Bocha credential | Strict evidence cache, deterministic ReviewPacket, structured generation |
| fixture | no `MODEL_*` outside production | Deterministic local/test result; production rejects missing model config |

Missing PandaAI or Bocha configuration is not a startup configuration error. It produces explicit failed or unavailable evidence at runtime and can result in a limited or unavailable `v2` review. Configure both for the intended full-evidence pipeline.

Market evidence tries AKShare first for funds, ETFs, and A-share daily series, then uses the public Tencent adapter per instrument when AKShare fails or returns too little data. Keep AKShare in an isolated Python environment and configure its interpreter with:

```dotenv
AKSHARE_PYTHON_EXECUTABLE=/absolute/path/to/venv/bin/python
```

AKShare follows upstream website changes and needs regular refreshes. Before debugging missing market data, starting market-adapter work, or releasing a related change, upgrade the isolated environment and then run live fund, ETF, and A-share probes through `src/providers/akshare-worker.py`:

```sh
uv pip install --python "$AKSHARE_PYTHON_EXECUTABLE" --upgrade akshare
"$AKSHARE_PYTHON_EXECUTABLE" -c \
  'import importlib.metadata; print(importlib.metadata.version("akshare"))'
```

Do not install AKShare into the system Python. Production should always set `AKSHARE_PYTHON_EXECUTABLE` explicitly; the code fallback is a development-machine path, not a portable host default. A successful package install is not acceptance evidence: the exact interfaces used by the worker still need live verification. If the worker cannot start or returns unusable data, `stream` falls back per instrument to Tencent.

Strict V2 variables:

```dotenv
PANDA_DATA_USERNAME=86xxxxxxxxxxx
PANDA_DATA_PASSWORD=replace-locally
PANDA_PYTHON_EXECUTABLE=/absolute/path/to/python3.12
BOCHA_API_KEY=replace-locally
```

The application also accepts the legacy `PANDA_USERNAME` and `PANDA_PASSWORD` names for compatibility, but production configuration should use `PANDA_DATA_USERNAME` and `PANDA_DATA_PASSWORD`. The parent process maps those values to the SDK names only inside the isolated worker environment.

PandaAI uses Python 3.12 and the repository's isolated worker boundary. Its encrypted SDK state is redirected to temporary storage and removed on all exit paths. Do not place credentials in fixtures, command arguments, or committed shell history.

## Optional A2A Deep Review

The A2A module is disabled unless both credentials are configured:

```dotenv
ARK_API_KEY=replace-locally
A2A_BEARER_TOKEN=an-independent-opaque-token-at-least-24-characters
A2A_PUBLIC_BASE_URL=https://mandune.example.com
```

`A2A_PUBLIC_BASE_URL` must be an HTTPS origin without a path, credentials, query, or fragment. `ARK_BASE_URL` can override the default Volcano Ark OpenAI-compatible endpoint only for controlled gateways or local tests. The Ark API key and caller Bearer token must be different secrets.

When enabled, the server exposes:

- `GET /.well-known/agent-card.json` without credentials;
- `POST /a2a/message:send` requires the caller token in the `Authorization` header and `A2A-Version: 1.0`.

The Agent Card never contains credentials.

## Daily briefing runtime

`MANDONG_DAILY_BRIEFINGS_DIR` is served at `/daily-briefings/` before the immutable client assets. The compiled worker writes a complete dated set and atomically updates `latest/` only after all seven themes share the same validated fact sheet.

```sh
pnpm build
MANDONG_DAILY_BRIEFINGS_DIR=/absolute/runtime/daily-briefings \
  node --env-file-if-exists=.env dist/daily-briefing/worker.js
```

The worker reuses a complete set for the current date. Pass `--force` only when an operator intentionally wants to regenerate that date. Production installs `mandong-daily-briefing.timer`, scheduled for 08:00 Asia/Shanghai with up to five minutes of randomized delay. The current automated collector retrieves the three configured mainland index candles from Tencent and leaves `news` empty; it never reuses stale news to make a briefing look current.

## Health Surface

`GET /health` returns only service status, service name, version, and process uptime. It intentionally omits provider names, model IDs, database paths, credentials, and workspace state.

## Validation Rules

Configuration fails fast for partial credential groups, invalid ports, relative database, migration, or daily-briefing paths, insecure remote model URLs, invalid protocol names, malformed A2A origins, and out-of-range timeouts. A production process should stop on these errors instead of substituting weaker defaults.
