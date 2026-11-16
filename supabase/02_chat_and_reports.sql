-- Bones & Brine: chat moderation (strikes and timeouts), player reports and the admin inbox.
-- Run once after setup.sql: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to run again.

-- Strike count and current timeout per account --------------------------------------------------
create table if not exists public.chat_strikes (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  strikes      integer not null default 0,
  muted_until  timestamptz,
  updated_at   timestamptz not null default now()
);

-- Every censored chat message (kept as evidence for the admin) ----------------------------------
create table if not exists public.chat_violations (
  id          bigserial primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  username    text,
  original    text not null,
  censored    text not null,
  created_at  timestamptz not null default now()
);

-- Player reports and automatic chat cases: the admin's inbox ------------------------------------
create table if not exists public.reports (
  id           bigserial primary key,
  kind         text not null check (kind in ('player', 'chat_auto')),
  reporter_id  uuid references auth.users (id) on delete set null,
  reporter     text,
  reported_id  uuid references auth.users (id) on delete set null,
  reported     text not null,
  reason       text not null default '',
  details      text not null default '',
  evidence     jsonb not null default '[]'::jsonb,
  status       text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

alter table public.chat_strikes enable row level security;
alter table public.chat_violations enable row level security;
alter table public.reports enable row level security;
-- No direct table access at all: everything goes through the functions below.
revoke all on public.chat_strikes, public.chat_violations, public.reports from anon, authenticated;

-- A player's own client calls this when the filter censored one of their messages. ----------
-- Timeouts: 1st strike 30 s, 2nd 5 min, 3rd 15 min, 4th and later 24 h.
-- From the 5th strike on, the admin gets a case with every censored message the player sent.
create or replace function public.record_chat_strike(p_original text, p_censored text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uname text;
  n integer;
  until timestamptz;
  ev jsonb;
begin
  if uid is null then raise exception 'Sign in to chat'; end if;
  select username into uname from public.profiles where id = uid;
  insert into public.chat_violations (user_id, username, original, censored)
    values (uid, uname, left(coalesce(p_original, ''), 300), left(coalesce(p_censored, ''), 300));
  insert into public.chat_strikes as s (user_id, strikes) values (uid, 1)
    on conflict (user_id) do update set strikes = s.strikes + 1, updated_at = now()
    returning strikes into n;
  until := now() + case when n = 1 then interval '30 seconds'
                        when n = 2 then interval '5 minutes'
                        when n = 3 then interval '15 minutes'
                        else interval '24 hours' end;
  update public.chat_strikes set muted_until = until where user_id = uid;
  if n >= 5 then
    select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'said', original, 'shown', censored) order by created_at), '[]'::jsonb)
      into ev from public.chat_violations where user_id = uid;
    update public.reports set evidence = ev, details = format('%s censored messages so far', n), created_at = now()
     where reported_id = uid and kind = 'chat_auto' and status = 'open';
    if not found then
      insert into public.reports (kind, reporter, reported_id, reported, reason, details, evidence)
        values ('chat_auto', 'Chat filter', uid, uname, 'Repeated bad language', format('%s censored messages so far', n), ev);
    end if;
  end if;
  return jsonb_build_object('strikes', n, 'muted_until', until);
end $$;

-- Is someone (default: me) timed out from chat right now? Hosts check this before relaying a message.
create or replace function public.chat_status(p_user uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'strikes', coalesce(s.strikes, 0),
    'muted_until', case when s.muted_until > now() then s.muted_until else null end)
  from (select 1) one
  left join public.chat_strikes s on s.user_id = coalesce(p_user, auth.uid())
$$;

-- Report another pirate (signed-in players; at most 6 reports an hour each). --------------------
create or replace function public.submit_report(p_reported text, p_reason text, p_details text, p_evidence jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uname text;
  target uuid;
  new_id bigint;
begin
  if uid is null then raise exception 'Sign in to report a player'; end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Ye have sent a lot of reports — try again later';
  end if;
  select username into uname from public.profiles where id = uid;
  select id into target from public.profiles where username = lower(p_reported);
  insert into public.reports (kind, reporter_id, reporter, reported_id, reported, reason, details, evidence)
    values ('player', uid, uname, target, left(coalesce(p_reported, '?'), 40), left(coalesce(p_reason, ''), 40),
            left(coalesce(p_details, ''), 600),
            coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e limit 40) x), '[]'::jsonb))
    returning id into new_id;
  return new_id;
end $$;

-- Admin inbox -----------------------------------------------------------------------------------
create or replace function public.admin_reports(p_status text default 'open')
returns setof public.reports language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  return query select * from public.reports where p_status = 'all' or status = p_status order by created_at desc limit 200;
end $$;

create or replace function public.admin_report_count()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 0; end if;
  return (select count(*) from public.reports where status = 'open');
end $$;

create or replace function public.admin_resolve_report(p_id bigint, p_status text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  if p_status not in ('open', 'reviewed', 'dismissed') then raise exception 'Bad status'; end if;
  update public.reports set status = p_status, reviewed_at = case when p_status = 'open' then null else now() end where id = p_id;
  return p_status;
end $$;

-- Admin: see and reset a pirate's chat strikes
create or replace function public.admin_chat_record(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  select id into uid from public.profiles where username = lower(p_username);
  return jsonb_build_object(
    'strikes', coalesce((select strikes from public.chat_strikes where user_id = uid), 0),
    'muted_until', (select muted_until from public.chat_strikes where user_id = uid and muted_until > now()),
    'violations', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'said', original) order by created_at desc)
                            from (select * from public.chat_violations where user_id = uid order by created_at desc limit 50) v), '[]'::jsonb));
end $$;

create or replace function public.admin_clear_strikes(p_username text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  update public.chat_strikes set strikes = 0, muted_until = null, updated_at = now()
   where user_id = (select id from public.profiles where username = lower(p_username));
  return true;
end $$;

revoke all on function public.record_chat_strike(text, text), public.chat_status(uuid), public.submit_report(text, text, text, jsonb),
                       public.admin_reports(text), public.admin_report_count(), public.admin_resolve_report(bigint, text),
                       public.admin_chat_record(text), public.admin_clear_strikes(text) from public, anon;
grant execute on function public.record_chat_strike(text, text), public.chat_status(uuid), public.submit_report(text, text, text, jsonb),
                          public.admin_reports(text), public.admin_report_count(), public.admin_resolve_report(bigint, text),
                          public.admin_chat_record(text), public.admin_clear_strikes(text) to authenticated;
