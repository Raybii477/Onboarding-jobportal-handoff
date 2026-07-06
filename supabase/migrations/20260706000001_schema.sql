-- ============================================================
-- 01. Core schema: enums, tables, helper functions
-- Shared by both modules (job portal + onboarding/vetting).
-- ============================================================

create type public.user_role as enum ('candidate', 'employee', 'reviewer', 'admin');
create type public.posting_visibility as enum ('public', 'internal', 'both');
create type public.posting_status as enum ('draft', 'open', 'closed');
create type public.application_stage as enum ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
create type public.case_status as enum ('in_progress', 'complete');
create type public.submission_status as enum ('pending', 'submitted', 'approved', 'rejected', 'resubmit_requested');
create type public.notification_type as enum (
  'application_received',
  'stage_changed',
  'onboarding_created',
  'document_decision',
  'case_complete'
);

-- ------------------------------------------------------------
-- Shared tables
-- ------------------------------------------------------------

create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'candidate',
  department text,
  full_name  text not null default '',
  email      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  type       public.notification_type not null,
  payload    jsonb not null default '{}'::jsonb,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;

-- ------------------------------------------------------------
-- Job portal module
-- ------------------------------------------------------------

create table public.job_postings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  department  text,
  visibility  public.posting_visibility not null default 'public',
  status      public.posting_status not null default 'draft',
  created_by  uuid not null references public.profiles (user_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  applicant_id     uuid not null references public.profiles (user_id) on delete cascade,
  posting_id       uuid not null references public.job_postings (id) on delete cascade,
  resume_file_path text,
  stage            public.application_stage not null default 'applied',
  referred_by      uuid references public.profiles (user_id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (applicant_id, posting_id)
);

create index applications_posting_stage_idx on public.applications (posting_id, stage);

-- ------------------------------------------------------------
-- Onboarding & vetting module (single department, single tenant)
-- ------------------------------------------------------------

create table public.onboarding_cases (
  id                    uuid primary key default gen_random_uuid(),
  new_hire_profile_id   uuid not null references public.profiles (user_id) on delete cascade,
  source_application_id uuid unique references public.applications (id) on delete set null,
  status                public.case_status not null default 'in_progress',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index onboarding_cases_new_hire_idx on public.onboarding_cases (new_hire_profile_id);

-- Configurable checklist template. The seed list is a placeholder:
-- the exact required document list is an open question for the department.
create table public.document_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  required    boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.document_submissions (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.onboarding_cases (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id),
  file_path        text,
  status           public.submission_status not null default 'pending',
  reviewer_id      uuid references public.profiles (user_id),
  reviewer_notes   text,
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (case_id, document_type_id)
);

create index document_submissions_case_idx on public.document_submissions (case_id);

-- ------------------------------------------------------------
-- Helper functions used by RLS policies.
-- SECURITY DEFINER so policies on other tables can consult
-- profiles without recursive RLS evaluation.
-- ------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('reviewer', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_internal_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('employee', 'reviewer', 'admin'), false);
$$;

-- ------------------------------------------------------------
-- Profile auto-provisioning: one row per auth.users row.
-- Identity path decides the starting role:
--   * Entra ID OIDC sign-in (any non-email provider) -> employee
--   * Supabase email / magic link                    -> candidate
-- reviewer/admin are granted manually by an admin afterwards.
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    case
      when coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email' then 'candidate'::public.user_role
      else 'employee'::public.user_role
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger job_postings_set_updated_at before update on public.job_postings
  for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger onboarding_cases_set_updated_at before update on public.onboarding_cases
  for each row execute function public.set_updated_at();
create trigger document_submissions_set_updated_at before update on public.document_submissions
  for each row execute function public.set_updated_at();
