-- ============================================================
-- 08. Fix: the profile privilege guard should only constrain
-- API users (anon/authenticated via PostgREST). Direct database
-- roles (postgres, service_role) have no auth.uid() and already
-- bypass RLS — the guard must not block administrative SQL.
-- ============================================================

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- direct/service-role access, not an API user
  end if;
  if (new.role is distinct from old.role or new.department is distinct from old.department)
     and not public.is_admin() then
    raise exception 'only admins can change role or department';
  end if;
  return new;
end;
$$;
