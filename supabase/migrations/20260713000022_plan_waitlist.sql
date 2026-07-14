-- Premium/Recruiter interest capture. No checkout until a premium feature exists to gate.
create table plan_waitlist (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references actors(id) on delete set null,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  plan text not null check (plan in ('premium','recruiter')),
  created_at timestamptz not null default now(),
  unique (email, plan)
);

alter table plan_waitlist enable row level security;
-- default-deny: all access via the service-role choke point
grant all on plan_waitlist to service_role;
