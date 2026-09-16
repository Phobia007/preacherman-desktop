-- Permanent account numbers. The existing email-only test account is deliberately
-- left unnumbered; the first GitHub member starts at 1. Never renumber on login.
lock table auth.users in share row exclusive mode;
alter table public.profiles
  add column member_number bigint unique check (member_number between 1 and 9007199254740991),
  add column avatar_url text not null default '' check (length(avatar_url) <= 2048);

create table private.member_number_counter (
  singleton boolean primary key default true check (singleton),
  last_number bigint not null check (last_number between 0 and 9007199254740991)
);
alter table private.member_number_counter enable row level security;
revoke all on private.member_number_counter from public, anon, authenticated;
insert into private.member_number_counter(singleton, last_number) values (true, 0);

-- A locked counter row allocates in transaction order. Failed registrations roll
-- back their allocation; deleted members' numbers are never reused.
create function private.create_member_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  assigned_number bigint;
  profile_name text;
  profile_avatar text;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT' then
    raise exception 'This function is only for account registration';
  end if;
  if (select auth.uid()) is not null and (select auth.uid()) <> new.id then
    raise exception 'Account identity mismatch';
  end if;
  if new.is_anonymous then return new; end if;
  update private.member_number_counter set last_number = last_number + 1
    where singleton returning last_number into strict assigned_number;
  profile_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'user_name'), ''), ''), 120);
  profile_avatar := coalesce(new.raw_user_meta_data->>'avatar_url', '');
  if length(profile_avatar) > 2048 or profile_avatar !~ '^https://avatars[.]githubusercontent[.]com/' then
    profile_avatar := '';
  end if;
  insert into public.profiles(user_id, display_name, avatar_url, member_number)
    values (new.id, profile_name, profile_avatar, assigned_number);
  return new;
end;
$$;
revoke all on function private.create_member_profile() from public, anon, authenticated;

-- Bootstrap only the already-verified GitHub member, without embedding generated
-- auth UUIDs or altering the older email test account or any of its data.
do $$
declare existing_member record; assigned_number bigint;
begin
  for existing_member in
    select id, raw_user_meta_data from auth.users
    where raw_app_meta_data->>'provider' = 'github' and not coalesce(is_anonymous, false)
    order by created_at, id
  loop
    update private.member_number_counter set last_number = last_number + 1
      where singleton returning last_number into strict assigned_number;
    insert into public.profiles(user_id, display_name, avatar_url, member_number)
      values (existing_member.id,
        left(coalesce(nullif(btrim(existing_member.raw_user_meta_data->>'full_name'), ''),
          nullif(btrim(existing_member.raw_user_meta_data->>'name'), ''),
          nullif(btrim(existing_member.raw_user_meta_data->>'user_name'), ''), ''), 120),
        case when length(existing_member.raw_user_meta_data->>'avatar_url') <= 2048
          and existing_member.raw_user_meta_data->>'avatar_url' ~ '^https://avatars[.]githubusercontent[.]com/'
          then existing_member.raw_user_meta_data->>'avatar_url' else '' end,
        assigned_number)
      on conflict (user_id) do update set member_number = excluded.member_number,
        avatar_url = excluded.avatar_url,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name);
  end loop;
end;
$$;

create trigger on_auth_user_created_member
  after insert on auth.users for each row execute function private.create_member_profile();

-- Existing per-user RLS and column-level write grants remain in force. Clients
-- may edit display_name, but can never choose or overwrite a member number.
comment on column public.profiles.member_number is 'Server-assigned permanent registration number; NULL for the legacy email test account.';
notify pgrst, 'reload schema';
