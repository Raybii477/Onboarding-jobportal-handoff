-- ============================================================
-- 07. Document files: several files per checklist item, and a
--     history of every earlier attempt.
--
-- Until now a document_submissions row carried a single
-- file_path, so re-uploading silently overwrote the pointer and
-- the previous attempt was lost. document_files stores one row
-- per uploaded file instead:
--
--   * ACTIVE files (superseded_at is null) are the current
--     attempt -- there can be several, e.g. both sides of an ID
--   * SUPERSEDED files are kept as history and stay readable by
--     the new hire and by staff
--
-- A new attempt begins when the new hire uploads again after a
-- reviewer sent the document back; the previous attempt's files
-- are retired by the trigger below rather than by the client.
--
-- document_submissions.file_path is kept, pointing at the most
-- recent file, so the existing RLS check and queries still work.
-- ============================================================

create table public.document_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.document_submissions (id) on delete cascade,
  file_path     text not null unique,
  file_name     text not null,
  file_size     bigint,
  content_type  text,
  uploaded_by   uuid references public.profiles (user_id) on delete set null,
  -- clock_timestamp(), not now(): attaching several files is a single
  -- multi-row insert, and now() would stamp them all identically,
  -- leaving their order -- and the pointer below -- down to a uuid tiebreak.
  uploaded_at   timestamptz not null default clock_timestamp(),
  superseded_at timestamptz
);

create index document_files_submission_idx
  on public.document_files (submission_id, uploaded_at desc);

create index document_files_active_idx
  on public.document_files (submission_id)
  where superseded_at is null;

-- ------------------------------------------------------------
-- Backfill: every file_path already on a submission becomes the
-- active file of that submission. Storage keys follow
-- {case_id}/{document_type_id}/{epoch}-{filename}, so the display
-- name is the last path segment with the epoch prefix stripped.
-- ------------------------------------------------------------

insert into public.document_files (submission_id, file_path, file_name, uploaded_by, uploaded_at)
select
  s.id,
  s.file_path,
  coalesce(
    nullif(regexp_replace(regexp_replace(s.file_path, '^.*/', ''), '^[0-9]+-', ''), ''),
    'document'
  ),
  c.new_hire_profile_id,
  coalesce(s.submitted_at, s.updated_at, s.created_at)
from public.document_submissions s
join public.onboarding_cases c on c.id = s.case_id
where s.file_path is not null
on conflict (file_path) do nothing;

-- ------------------------------------------------------------
-- RLS. Mirrors document_submissions: the new hire sees and
-- manages the files on their own case, staff read everything.
-- ------------------------------------------------------------

create or replace function public.owns_submission(p_submission_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_submissions s
    join public.onboarding_cases c on c.id = s.case_id
    where s.id = p_submission_id
      and c.new_hire_profile_id = auth.uid()
  );
$$;

alter table public.document_files enable row level security;

create policy "document files: new hire reads own"
  on public.document_files for select
  using (public.owns_submission(submission_id));

create policy "document files: staff reads all"
  on public.document_files for select
  using (public.is_staff());

-- Attaching is only allowed while the submission is still awaiting
-- the new hire or under review, and never on an approved document.
create policy "document files: new hire attaches to own submission"
  on public.document_files for insert
  with check (
    public.owns_submission(submission_id)
    and uploaded_by = auth.uid()
    and superseded_at is null
    and exists (
      select 1 from public.document_submissions s
      where s.id = submission_id
        and s.status in ('pending', 'submitted', 'rejected', 'resubmit_requested')
    )
  );

-- Counting through a definer function keeps the delete policy below
-- from re-entering RLS on the table it is protecting. It answers only
-- for callers who can already see the files.
create or replace function public.active_file_count(p_submission_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select case
    when public.owns_submission(p_submission_id) or public.is_staff() then (
      select count(*)::int
      from public.document_files f
      where f.submission_id = p_submission_id
        and f.superseded_at is null
    )
    else 0
  end;
$$;

-- Removing a file the new hire attached by mistake. History is
-- immutable, so only files in the current attempt can be removed, and
-- never the last one -- a document that has been handed to a reviewer
-- must keep at least one file behind it.
create policy "document files: new hire removes own active file"
  on public.document_files for delete
  using (
    public.owns_submission(submission_id)
    and superseded_at is null
    and public.active_file_count(submission_id) > 1
    and exists (
      select 1 from public.document_submissions s
      where s.id = submission_id
        and s.status <> 'approved'
    )
  );

-- ------------------------------------------------------------
-- Retire the previous attempt when the new hire resubmits.
--
-- The client inserts the new files first and only then flips the
-- submission back to 'submitted', so the two attempts are told
-- apart by the reviewer's decision timestamp: anything uploaded
-- at or before it belongs to the attempt being replaced. That
-- keeps the rule order-independent when several files are
-- attached in one go.
-- ------------------------------------------------------------

create or replace function public.retire_previous_attempt()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and old.status in ('rejected', 'resubmit_requested') then
    update public.document_files
    set superseded_at = now()
    where submission_id = new.id
      and superseded_at is null
      and uploaded_at <= coalesce(old.reviewed_at, old.updated_at);
  end if;
  return new;
end;
$$;

create trigger document_submissions_retire_previous_attempt
  after update on public.document_submissions
  for each row execute function public.retire_previous_attempt();

-- ------------------------------------------------------------
-- Keep document_submissions.file_path pointing at the newest
-- active file, so the legacy pointer stays truthful without the
-- client having to maintain it. Runs as definer because the new
-- hire has no UPDATE rights on a submission already under review.
--
-- The `is distinct from` guard makes a no-op update do nothing,
-- which is what stops this from bouncing between the two tables.
-- ------------------------------------------------------------

create or replace function public.sync_submission_file_pointer()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_submission uuid := coalesce(new.submission_id, old.submission_id);
  v_newest     text;
begin
  select f.file_path into v_newest
  from public.document_files f
  where f.submission_id = v_submission
    and f.superseded_at is null
  order by f.uploaded_at desc, f.id desc
  limit 1;

  update public.document_submissions s
  set file_path = v_newest
  where s.id = v_submission
    and s.file_path is distinct from v_newest;

  return null;
end;
$$;

create trigger document_files_sync_pointer
  after insert or update or delete on public.document_files
  for each row execute function public.sync_submission_file_pointer();

-- ------------------------------------------------------------
-- Hardening, per migration 06: trigger functions are never called
-- through the PostgREST RPC API. owns_submission keeps its grants
-- because it is an RLS predicate evaluated as the calling role.
-- ------------------------------------------------------------

revoke execute on function public.retire_previous_attempt() from public, anon, authenticated;
revoke execute on function public.sync_submission_file_pointer() from public, anon, authenticated;
