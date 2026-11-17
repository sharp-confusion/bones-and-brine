-- Bones & Brine — daily rewards and the "most dice won" leaderboard.
-- Run once in Supabase → SQL Editor after setup.sql and 02_chat_and_reports.sql. Safe to run again.

alter table public.profiles add column if not exists dice_won    integer not null default 0;
alter table public.profiles add column if not exists dice_week   integer not null default 0;
alter table public.profiles add column if not exists week_start  date;
alter table public.profiles add column if not exists last_dice_at timestamptz;
alter table public.profiles add column if not exists daily_streak integer not null default 0;
alter table public.profiles add column if not exists last_daily  date;
-- Players can still only update coins / inv / data themselves (see setup.sql). These columns change only
-- through the functions below.

create index if not exists profiles_dice_won_idx  on public.profiles (dice_won desc);
create index if not exists profiles_dice_week_idx on public.profiles (week_start, dice_week desc);

-- Daily reward ladder: day 1..7 → 1,1,2,2,3,3,5 doubloons; the streak resets if a day is missed.
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  today date := (now() at time zone 'utc')::date;
  streak integer;
  reward integer;
begin
  if uid is null then raise exception 'Sign in to claim yer daily doubloons'; end if;
  select * into p from public.profiles where id = uid for update;
  if p.banned then raise exception 'This account has been banned.'; end if;
  if p.last_daily = today then
    return jsonb_build_object('claimed', false, 'streak', p.daily_streak, 'coins', p.coins, 'next', (today + 1)::timestamp at time zone 'utc');
  end if;
  streak := case when p.last_daily = today - 1 then p.daily_streak + 1 else 1 end;
  reward := (array[1, 1, 2, 2, 3, 3, 5])[((streak - 1) % 7) + 1];
  update public.profiles set coins = coins + reward, daily_streak = streak, last_daily = today where id = uid
    returning coins into p.coins;
  return jsonb_build_object('claimed', true, 'reward', reward, 'streak', streak, 'coins', p.coins, 'next', (today + 1)::timestamp at time zone 'utc');
end $$;

-- One die won, counted for the leaderboard (at most one every 2 seconds, so it can't be spammed).
create or replace function public.record_dice_won()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  wk date := date_trunc('week', now() at time zone 'utc')::date;
begin
  if uid is null then return null; end if;
  select * into p from public.profiles where id = uid for update;
  if p.banned or (p.last_dice_at is not null and p.last_dice_at > now() - interval '2 seconds') then
    return jsonb_build_object('dice_won', p.dice_won, 'dice_week', p.dice_week);
  end if;
  update public.profiles set
    dice_won = dice_won + 1,
    dice_week = case when week_start = wk then dice_week + 1 else 1 end,
    week_start = wk,
    last_dice_at = now()
  where id = uid returning dice_won, dice_week into p.dice_won, p.dice_week;
  return jsonb_build_object('dice_won', p.dice_won, 'dice_week', p.dice_week);
end $$;

-- Top 50 (all time or this week) plus where the asking player stands. Anyone can look, guests included.
create or replace function public.leaderboard(p_period text default 'all')
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  wk date := date_trunc('week', now() at time zone 'utc')::date;
  rows jsonb;
  mine jsonb;
begin
  with ranked as (
    select username, data -> 'avatar' as avatar, coalesce(data ->> 'name', username) as name,
           case when p_period = 'week' then (case when week_start = wk then dice_week else 0 end) else dice_won end as score,
           id
    from public.profiles where not banned
  ), ordered as (
    select *, rank() over (order by score desc) as pos from ranked where score > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object('pos', pos, 'username', username, 'name', name, 'avatar', avatar, 'score', score) order by pos, username), '[]'::jsonb)
    into rows from (select * from ordered order by pos, username limit 50) t;
  if auth.uid() is not null then
    with ranked as (
      select id, case when p_period = 'week' then (case when week_start = wk then dice_week else 0 end) else dice_won end as score
      from public.profiles where not banned
    )
    select jsonb_build_object('score', r.score, 'pos', case when r.score > 0 then (select count(*) + 1 from ranked x where x.score > r.score) end)
      into mine from ranked r where r.id = auth.uid();
  end if;
  return jsonb_build_object('rows', rows, 'me', mine);
end $$;

revoke all on function public.claim_daily(), public.record_dice_won(), public.leaderboard(text) from public;
grant execute on function public.claim_daily(), public.record_dice_won() to authenticated;
grant execute on function public.leaderboard(text) to anon, authenticated;

-- Admin → player messages: the Admin Desk's live gifts, kicks and bans reach the player's open game.
-- Only the admin can send them, and each player can only collect their own.
create table if not exists public.admin_messages (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cmd text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_messages enable row level security;   -- no policies: only the functions below touch it

create or replace function public.admin_notify(p_username text, p_cmd text, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  if p_cmd not in ('gift', 'kick', 'ban', 'note') then raise exception 'Unknown command'; end if;
  select id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'No such pirate'; end if;
  insert into public.admin_messages (user_id, cmd, payload) values (target, p_cmd, coalesce(p_payload, '{}'::jsonb));
  delete from public.admin_messages where created_at < now() - interval '7 days';
end $$;

create or replace function public.take_admin_messages()
returns setof public.admin_messages language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query delete from public.admin_messages where user_id = auth.uid() returning *;
end $$;

revoke all on function public.admin_notify(text, text, jsonb), public.take_admin_messages() from public, anon;
grant execute on function public.admin_notify(text, text, jsonb), public.take_admin_messages() to authenticated;

-- Hosts check who joined their table (and whether a spectator really is the admin), even when the host is a guest.
-- Takes an id the host got from Supabase's own token check, so it can't be used to look players up by name.
create or replace function public.account_check(p_id uuid)
returns table (id uuid, username text, is_admin boolean, banned boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.is_admin, p.banned from public.profiles p where p.id = p_id;
$$;
revoke all on function public.account_check(uuid) from public;
grant execute on function public.account_check(uuid) to anon, authenticated;
