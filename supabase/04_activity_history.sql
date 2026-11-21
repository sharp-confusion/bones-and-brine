-- Bones & Brine — 7-day activity history for the Admin Desk (📅 Past 7 days).
-- Run once in Supabase → SQL Editor after the earlier files. Safe to run again.
--
-- Each time someone opens the game a "visit" row is made. While the game is open it pings about once a minute
-- with what they did since the last ping (the same lines the 🟢 Online tab shows). Rows older than 7 days are
-- deleted automatically. Guests are tracked by a random id kept in their browser, never by IP or anything else.

create table if not exists public.activity_visits (
  id          uuid primary key,                       -- made by the browser, one per visit
  visitor     text not null,                          -- random per-browser id (guests and accounts)
  user_id     uuid references public.profiles (id) on delete cascade,   -- set when signed in (server-checked)
  name        text not null default '',
  device      text not null default '',
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  events      jsonb not null default '[]'::jsonb      -- [{ "at": 1732190000000, "text": "→ The Tavern" }, …]
);
create index if not exists activity_visits_last_seen_idx on public.activity_visits (last_seen desc);
alter table public.activity_visits enable row level security;   -- no policies: only the functions below touch it
revoke all on public.activity_visits from anon, authenticated;

-- The game calls this every ~60 s while open (guests too). Text is trimmed, at most 300 events are kept per
-- visit, and a visit can't be stretched past 24 h or taken over by another account.
create or replace function public.activity_ping(p_id uuid, p_visitor text, p_name text, p_device text, p_events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ev jsonb;
begin
  if p_id is null or coalesce(p_visitor, '') = '' then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('at', (e ->> 'at')::bigint, 'text', left(e ->> 'text', 90))), '[]'::jsonb)
    into ev
    from (select e from jsonb_array_elements(case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end) e
          where (e ->> 'at') ~ '^\d{10,14}$' limit 40) x;

  insert into public.activity_visits as v (id, visitor, user_id, name, device, events)
  values (p_id, left(p_visitor, 40), uid, left(coalesce(p_name, ''), 24), left(coalesce(p_device, ''), 120), ev)
  on conflict (id) do update set
    last_seen = now(),
    user_id   = coalesce(v.user_id, excluded.user_id),
    name      = excluded.name,
    device    = excluded.device,
    events    = (select coalesce(jsonb_agg(x order by n), '[]'::jsonb)
                 from (select x, n from jsonb_array_elements(v.events || excluded.events) with ordinality t(x, n)
                       order by n desc limit 300) k)
  where v.visitor = excluded.visitor
    and (v.user_id is null or v.user_id = uid)
    and v.started_at > now() - interval '24 hours';

  if random() < 0.05 then delete from public.activity_visits where last_seen < now() - interval '7 days'; end if;
end $$;

-- Admin: every visit in the last p_days days (max 7), newest first.
create or replace function public.admin_activity(p_days integer default 7)
returns table (id uuid, visitor text, username text, is_admin boolean, name text, device text,
               started_at timestamptz, last_seen timestamptz, events jsonb)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  return query
    select v.id, v.visitor, p.username, coalesce(p.is_admin, false), v.name, v.device, v.started_at, v.last_seen, v.events
    from public.activity_visits v left join public.profiles p on p.id = v.user_id
    where v.last_seen > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 7))
    order by v.started_at desc
    limit 2000;
end $$;

revoke all on function public.activity_ping(uuid, text, text, text, jsonb), public.admin_activity(integer) from public;
grant execute on function public.activity_ping(uuid, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_activity(integer) to authenticated;
