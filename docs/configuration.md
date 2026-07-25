# Configuration

Mandune reads runtime configuration from the server process environment. Start from [`.env.example`](../.env.example), keep the resulting `.env` untracked, and never use `VITE_*` for provider or model credentials.

The `MANDONG_*` environment variables and `/opt/mandong` service paths predate the public Mandune name. They remain stable deployment interfaces for compatibility.

## Core Runtime

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `HOST` | No | `127.0.0.1` | Node listener address |
| `PORT` | No | `8787` | Node listener port |
| `APP_VERSION` | No | `0.1.0` | Version returned by `/health`; production should use the commit SHA |
| `MANDONG_DB_PATH` | Production | `/var/lib/mandong/mandong.sqlite3` | Absolute SQLite path |
| `MANDONG_MIGRATIONS_DIR` | No | `<cwd>/migrations` | Absolute migration directory override |
| `MANDONG_DB_BUSY_TIMEOUT_MS` | No | `1000` | SQLite write-lock wait, from `0` to `60000` ms |
| `MANDONG_ANALYSIS_DEADLINE_MS` | No | `180000` | Analysis hard deadline, from `10000` to `3600000` ms |

For local development, create an ignored `.localdata` directory and set `MANDONG_DB_PATH` to an absolute path inside it.

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

| Mode | Requirements | Behavior |
| --- | --- | --- |
| unset / `stream` | `MODEL_*` | Public market evidence plus one streaming text generation |
| `v2` | `MODEL_*`, PandaAI runtime, Bocha credential | Strict evidence cache, deterministic ReviewPacket, structured generation |
| fixture | no `MODEL_*` | Deterministic local/test result, clearly marked non-live |

Strict V2 variables:

```dotenv
PANDA_USERNAME=86xxxxxxxxxxx
PANDA_PASSWORD=replace-locally
PANDA_PYTHON_EXECUTABLE=/absolute/path/to/python3.12
BOCHA_API_KEY=replace-locally
```

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
- `POST /a2a/message:send` with `Authorization: Bearer ...`.

The Agent Card never contains credentials.

## Health Surface

`GET /health` returns only service status, service name, version, and process uptime. It intentionally omits provider names, model IDs, database paths, credentials, and workspace state.

## Validation Rules

Configuration fails fast for partial credential groups, invalid ports, relative database or migration paths, insecure remote model URLs, invalid protocol names, malformed A2A origins, and out-of-range timeouts. A production process should stop on these errors instead of substituting weaker defaults.
