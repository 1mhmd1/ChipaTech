-- =============================================================
-- 0004_fix_user_trigger.sql
--
-- Hardens public.handle_new_user so that auth.users signup never
-- fails because of a problem with the public.users mirror row.
--
-- The previous version (in 0001_init.sql) would propagate any
-- exception — e.g. unique-violation on email when a stale row
-- already existed, or invalid `role` cast from raw_user_meta_data
-- — back to Supabase Auth, which then surfaced as the dreaded
-- "Database error creating new user".
--
-- Run this once in the SQL Editor; it's safe to re-run.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
  resolved_role public.user_role;
  resolved_name text;
begin
  -- Resolve role safely. Anything other than the three known values
  -- falls back to 'internal' so a bad metadata blob never aborts
  -- the signup.
  meta_role := nullif(new.raw_user_meta_data->>'role', '');
  if meta_role in ('super_admin', 'internal', 'partner') then
    resolved_role := meta_role::public.user_role;
  else
    resolved_role := 'internal'::public.user_role;
  end if;

  resolved_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  -- Upsert by id (the canonical key) AND survive a stale email row
  -- by using a wider conflict target via WHERE NOT EXISTS.
  begin
    insert into public.users (id, email, full_name, role, is_active)
    values (new.id, new.email, resolved_name, resolved_role, true)
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          role = excluded.role;
  exception
    when unique_violation then
      -- Email already taken by a stale row from a previous attempt.
      -- Re-link that row to the new auth user id instead of failing.
      update public.users
         set id = new.id,
             full_name = resolved_name,
             role = resolved_role,
             is_active = true
       where lower(email) = lower(new.email);
    when others then
      -- Last-resort safety net. We never want auth.users insert to
      -- fail because of a profile-row issue — surface a notice and
      -- continue. The admin can populate public.users manually.
      raise notice 'handle_new_user (auth.users id=%, email=%) failed: %',
        new.id, new.email, sqlerrm;
  end;

  return new;
end;
$$;

-- Re-bind the trigger to the new function definition.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
