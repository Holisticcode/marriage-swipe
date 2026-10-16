-- Marriage Swipe: initial schema

create table users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  phone               text unique,
  password_hash       text not null,
  role                text not null default 'user' check (role in ('user','admin')),
  status              text not null default 'active' check (status in ('active','suspended','removed')),
  status_reason       text,
  status_at           timestamptz,
  email_verified      boolean not null default false,
  phone_verified      boolean not null default false,
  is_sample           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_login_at       timestamptz,

  -- profile
  name                text,
  age                 int check (age is null or age between 18 and 90),
  gender              text check (gender in ('Man','Woman')),
  looking_for         text check (looking_for in ('Man','Woman','Everyone')),
  relationship_status text check (relationship_status in ('Single','Divorced','Widowed','Separated')),
  city                text,
  bio                 text,
  hue                 int,

  -- selfie verification
  verified            boolean not null default false,
  verify_method       text check (verify_method in ('ai','admin','sample')),
  verified_at         timestamptz,
  face_descriptor     jsonb,
  selfie_photo_id     uuid
);
create index users_city_idx on users (lower(city));
create index users_status_idx on users (status);

create table photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('selfie','extra')),
  status      text not null check (status in ('approved','review','rejected')),
  reason      text,
  file_key    text,                 -- stored file (rejected photos keep only a tiny blurred thumbnail)
  scores      jsonb,
  decided_by  text,                 -- 'ai' | 'admin' | 'user'
  attempt     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index photos_user_idx on photos (user_id);
create index photos_status_idx on photos (status);

alter table users add constraint users_selfie_fk foreign key (selfie_photo_id) references photos(id) on delete set null;

create table swipes (
  user_id    uuid not null references users(id) on delete cascade,
  target_id  uuid not null references users(id) on delete cascade,
  direction  text not null check (direction in ('yes','no')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);
create index swipes_target_idx on swipes (target_id);

create table matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references users(id) on delete cascade,
  user_b     uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table messages (
  id         bigserial primary key,
  match_id   uuid not null references matches(id) on delete cascade,
  sender_id  uuid not null references users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index messages_match_idx on messages (match_id, id);

create table blocks (
  user_id    uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

create table reports (
  id          bigserial primary key,
  reporter_id uuid references users(id) on delete set null,   -- null = raised automatically by the system
  target_id   uuid not null references users(id) on delete cascade,
  reason      text not null,
  note        text,
  open        boolean not null default true,
  resolution  text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index reports_target_idx on reports (target_id, open);

create table refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  user_agent  text
);
create index refresh_user_idx on refresh_tokens (user_id);

create table verification_codes (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  purpose    text not null check (purpose in ('email','phone','reset')),
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index vcodes_user_idx on verification_codes (user_id, purpose);

create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,                 -- no foreign key: entries must outlive deleted accounts
  actor_label text,
  action      text not null,
  target_id   uuid,
  detail      jsonb
);
create index audit_at_idx on audit_log (at desc);
create index audit_target_idx on audit_log (target_id);
