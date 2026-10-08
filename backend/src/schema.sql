-- Saathi schema | Developed by Devnale Globals
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT NOT NULL,
  mobile           TEXT UNIQUE NOT NULL,          -- E.164, unique identity
  email            TEXT UNIQUE,
  password_hash    TEXT NOT NULL,
  dob              DATE,
  gender           TEXT,
  city             TEXT,
  emergency_name   TEXT,
  emergency_mobile TEXT,
  mobile_verified  BOOLEAN NOT NULL DEFAULT false,
  push_token       TEXT,
  consent_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otps (
  mobile     TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0
);

-- One row = one share relationship (sharer -> viewer)
CREATE TABLE IF NOT EXISTS shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  viewer_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  invite_mobile    TEXT,            -- set when the other person is not registered yet
  invite_email     TEXT,
  initiated_by     TEXT NOT NULL CHECK (initiated_by IN ('sharer','viewer')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','rejected','cancelled','expired')),
  duration         TEXT NOT NULL CHECK (duration IN ('1h','1d','1w','1m','custom','until_cancel')),
  duration_minutes INT,
  note             TEXT,
  starts_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,     -- NULL = until cancelled
  ended_at         TIMESTAMPTZ,
  -- proximity alert (viewer's setting)
  alert_enabled    BOOLEAN NOT NULL DEFAULT true,
  alert_radius_m   INT NOT NULL DEFAULT 5000,
  alert_center     TEXT NOT NULL DEFAULT 'me' CHECK (alert_center IN ('me','fixed')),
  alert_lat        DOUBLE PRECISION,
  alert_lng        DOUBLE PRECISION,
  alert_label      TEXT,
  alert_inside     BOOLEAN,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shares_sharer ON shares(sharer_id, status);
CREATE INDEX IF NOT EXISTS idx_shares_viewer ON shares(viewer_id, status);
CREATE INDEX IF NOT EXISTS idx_shares_invite_mobile ON shares(invite_mobile) WHERE invite_mobile IS NOT NULL;

CREATE TABLE IF NOT EXISTS locations (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy    REAL,
  speed       REAL,
  heading     REAL,
  battery     REAL,
  recorded_at TIMESTAMPTZ NOT NULL,     -- time on device (important for offline logs)
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  offline     BOOLEAN NOT NULL DEFAULT false,
  client_id   TEXT NOT NULL,
  UNIQUE (user_id, client_id)           -- de-duplicates retried offline uploads
);
CREATE INDEX IF NOT EXISTS idx_locations_user_time ON locations(user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS latest_locations (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy    REAL,
  speed       REAL,
  battery     REAL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sos_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  action     TEXT NOT NULL,
  meta       JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
