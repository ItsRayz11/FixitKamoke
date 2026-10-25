-- Messages sent through the public contact form.
create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index contact_messages_open_idx on contact_messages(handled, created_at desc);
