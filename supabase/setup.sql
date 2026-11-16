-- Bones & Brine: accounts, cloud saves, admin powers and bans.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again.

-- 1. One profile row per account ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  coins       integer not null default 5 check (coins >= 0),
  inv         jsonb   not null default '{}'::jsonb,   -- tavern goods: {"drink": 2, "cigar": 3, ...}
  data        jsonb   not null default '{}'::jsonb,   -- pirate look, dice kit, custom dice designs
  is_admin    boolean not null default false,
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "signed-in players can read profiles" on public.profiles;
create policy "signed-in players can read profiles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "players update their own profile" on public.profiles;
create policy "players update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Players may only change their own coins / goods / look. is_admin, banned and username are
-- locked: only the admin functions below (or you, in this SQL editor) can change them.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (coins, inv, data) on public.profiles to authenticated;

-- 2. Create the profile automatically when someone signs up -----------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Admin functions (they refuse to run for anyone who is not an admin) ----------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.admin_lookup(p_username text)
returns table (username text, coins integer, inv jsonb, banned boolean, is_admin boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  return query select p.username, p.coins, p.inv, p.banned, p.is_admin, p.created_at
               from public.profiles p where p.username = lower(p_username);
end $$;

create or replace function public.admin_add_coins(p_username text, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare result integer;
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  update public.profiles set coins = greatest(0, coins + p_delta)
   where username = lower(p_username) returning coins into result;
  if result is null then raise exception 'No pirate called %', p_username; end if;
  return result;
end $$;

create or replace function public.admin_give_item(p_username text, p_item text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  if p_item not in ('drink', 'smokes', 'cigar', 'steak', 'rum') then raise exception 'Unknown item %', p_item; end if;
  update public.profiles
     set inv = jsonb_set(inv, array[p_item], to_jsonb(greatest(0, coalesce((inv ->> p_item)::int, 0) + p_qty)))
   where username = lower(p_username) returning inv into result;
  if result is null then raise exception 'No pirate called %', p_username; end if;
  return result;
end $$;

create or replace function public.admin_set_ban(p_username text, p_banned boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare result boolean;
begin
  if not public.is_admin() then raise exception 'Only the admin can do that'; end if;
  update public.profiles set banned = p_banned
   where username = lower(p_username) and is_admin = false returning banned into result;
  if result is null then raise exception 'No (non-admin) pirate called %', p_username; end if;
  return result;
end $$;

revoke all on function public.admin_lookup(text), public.admin_add_coins(text, integer),
                       public.admin_give_item(text, text, integer), public.admin_set_ban(text, boolean) from public, anon;
grant execute on function public.is_admin(), public.admin_lookup(text), public.admin_add_coins(text, integer),
                          public.admin_give_item(text, text, integer), public.admin_set_ban(text, boolean) to authenticated;

-- 4. Make YOUR account the admin -------------------------------------------------------------
-- First create your admin account in the game (Sign in -> Create account), then run this line
-- with your username instead of the placeholder:
--
--   update public.profiles set is_admin = true where username = 'your_admin_name';
