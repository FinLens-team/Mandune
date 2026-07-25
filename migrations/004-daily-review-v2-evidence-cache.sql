CREATE TABLE market_observations (
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('a_share', 'etf', 'fund')),
  symbol TEXT NOT NULL,
  trading_day TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  observed_at TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  last_error_code TEXT,
  PRIMARY KEY (provider, method, asset_class, symbol, trading_day)
) STRICT;

CREATE INDEX market_observations_lookup_idx
  ON market_observations (asset_class, symbol, trading_day DESC);

CREATE TABLE asset_profiles (
  provider TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('a_share', 'etf', 'fund')),
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  refresh_after TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  last_error_code TEXT,
  PRIMARY KEY (provider, asset_class, symbol)
) STRICT;

CREATE TABLE event_searches (
  query_hash TEXT PRIMARY KEY,
  query_json TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  refresh_after TEXT NOT NULL,
  last_error_code TEXT
) STRICT;

CREATE TABLE event_candidates (
  candidate_id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL REFERENCES event_searches(query_hash) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  site_name TEXT,
  published_at TEXT,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('official', 'trusted_media', 'other')),
  verification_status TEXT NOT NULL,
  fetched_at TEXT NOT NULL
) STRICT;

CREATE INDEX event_candidates_query_idx
  ON event_candidates (query_hash, source_tier, published_at DESC);

CREATE TABLE source_documents (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('official', 'trusted_media', 'other')),
  status TEXT NOT NULL,
  title TEXT,
  published_at TEXT,
  excerpt TEXT,
  fetched_at TEXT NOT NULL,
  refresh_after TEXT NOT NULL,
  content_hash TEXT,
  last_error_code TEXT
) STRICT;
