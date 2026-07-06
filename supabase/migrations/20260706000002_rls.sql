-- ============================================================
-- 02. Row Level Security for every table.
-- Roles: candidate < employee < reviewer < admin (see profiles.role).
-- The service role (Edge Functions) bypasses RLS by design.
-- ============================================================

alter table public.profiles             enable row level security;
alter table public.notifications        enable row level security;
alter table public.job_postings         enable row level security;
alter table public.applications         enable row level security;
alter table public.onboarding_cases     enable row level security;
alter table public.document_types       enable row level security;
alter table public.document_submissions enable row level security;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------

create policy "profiles: read own or staff reads all"
  on public.profiles for select
  using (user_id = auth.uid() or public.is_staff());

create policy "profiles: users update own row"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profiles: admins update any row"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Prevent privilege escalation: only admins may change role/department.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.department is distinct from old.department)
     and not public.is_admin() then
    raise exception 'only admins can change role or department';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ------------------------------------------------------------
-- notifications (written by triggers/Edge Functions only)
-- ------------------------------------------------------------

create policy "notifications: read own"
  on public.notifications for select
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- job_postings
-- ------------------------------------------------------------

-- Public browsing (anon + candidates): open postings marked public/both.
create policy "postings: anyone reads open public postings"
  on public.job_postings for select
  using (status = 'open' and visibility in ('public', 'both'));

-- Internal browsing: employees/staff also see open internal postings.
create policy "postings: internal users read open internal postings"
  on public.job_postings for select
  using (status = 'open' and visibility in ('internal', 'both') and public.is_internal_user());

-- Admins (HR) see and manage everything, including drafts and closed postings.
create policy "postings: admins read all"
  on public.job_postings for select
  using (public.is_admin());

create policy "postings: admins insert"
  on public.job_postings for insert
  with check (public.is_admin() and created_by = auth.uid());

create policy "postings: admins update"
  on public.job_postings for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "postings: admins delete"
  on public.job_postings for delete
  using (public.is_admin());

-- ------------------------------------------------------------
-- applications
-- ------------------------------------------------------------

create policy "applications: applicant reads own"
  on public.applications for select
  using (applicant_id = auth.uid());

create policy "applications: referrer reads referral"
  on public.applications for select
  using (referred_by = auth.uid());

create policy "applications: staff reads all"
  on public.applications for select
  using (public.is_staff());

-- Applying: only for yourself, only at stage 'applied', and only to an open
-- posting that is actually visible to you.
create policy "applications: apply to a visible open posting"
  on public.applications for insert
  with check (
    applicant_id = auth.uid()
    and stage = 'applied'
    and exists (
      select 1 from public.job_postings p
      where p.id = posting_id
        and p.status = 'open'
        and (
          p.visibility in ('public', 'both')
          or (p.visibility = 'internal' and public.is_internal_user())
        )
    )
  );

-- Pipeline management (stage changes) is staff-only.
create policy "applications: staff updates"
  on public.applications for update
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------------
-- onboarding_cases
-- ------------------------------------------------------------

create policy "cases: new hire reads own case"
  on public.onboarding_cases for select
  using (new_hire_profile_id = auth.uid());

create policy "cases: staff reads all"
  on public.onboarding_cases for select
  using (public.is_staff());

-- Cases are normally created by the hired->onboarding Edge Function
-- (service role); admins may also create/adjust them manually.
create policy "cases: admins insert"
  on public.onboarding_cases for insert
  with check (public.is_admin());

create policy "cases: staff updates"
  on public.onboarding_cases for update
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------------
-- document_types (checklist template)
-- ------------------------------------------------------------

create policy "document types: authenticated users read"
  on public.document_types for select
  to authenticated
  using (true);

create policy "document types: admins manage"
  on public.document_types for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- document_submissions
-- ------------------------------------------------------------

create or replace function public.owns_case(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.onboarding_cases c
    where c.id = p_case_id and c.new_hire_profile_id = auth.uid()
  );
$$;

create policy "submissions: new hire reads own case submissions"
  on public.document_submissions for select
  using (public.owns_case(case_id));

create policy "submissions: staff reads all"
  on public.document_submissions for select
  using (public.is_staff());

-- Checklist rows are seeded by the Edge Function (service role);
-- admins may add ad-hoc requirements to a case.
create policy "submissions: admins insert"
  on public.document_submissions for insert
  with check (public.is_admin());

-- New hire uploads/re-uploads: only while the row is awaiting their action,
-- and the only state they can move it to is 'submitted'.
create policy "submissions: new hire submits documents"
  on public.document_submissions for update
  using (public.owns_case(case_id) and status in ('pending', 'rejected', 'resubmit_requested'))
  with check (public.owns_case(case_id) and status = 'submitted' and file_path is not null);

-- Reviewers decide: approve, reject outright, or request a resubmission.
create policy "submissions: staff reviews"
  on public.document_submissions for update
  using (public.is_staff())
  with check (public.is_staff() and status in ('approved', 'rejected', 'resubmit_requested'));
