-- Optional two-step sign-in for staff (authenticator app, RFC 6238). The secret is stored encrypted by the app
-- (AES-256-GCM, key from TWO_FACTOR_KEY); the database never holds it in the clear.
alter table admin_users
  add column totp_secret text,
  add column totp_enabled_at timestamptz,
  add column totp_last_step bigint; -- last accepted 30-second step, so a code cannot be used twice

-- Single-use recovery codes, stored only as hashes.
create table admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

-- A correct password opens a short-lived challenge; only a correct second step turns it into a session.
create table admin_login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null unique,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table admin_recovery_codes enable row level security;
alter table admin_login_challenges enable row level security;
