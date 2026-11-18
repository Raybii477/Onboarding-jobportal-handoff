-- ============================================================
-- 09. Redesign, phase 1: pipeline history and notes, and in-app
--     notifications.
--
--   * application_events  -- every application's stage history,
--                            written by triggers, never by clients
--   * application_notes   -- internal staff notes on a candidate
--   * notifications       -- read_at for the in-app bell and toasts,
--                            and an `email` flag so staff-only events
--                            appear in the app without emailing anyone
--   * send_candidate_message() -- the pipeline's "Email candidates"
--                            bulk action
--
-- Payloads of the existing notifications gain display names
-- (posting_title, document_name, new_hire_name) so the app can show
-- a readable line without a second query, including for postings a
-- candidate can no longer read once they close.
-- ============================================================

-- ------------------------------------------------------------
-- Staff can read every posting. Reviewers work the pipeline too,
-- and without this a closed posting's title came back null for them.
-- ------------------------------------------------------------

create policy "postings: staff read all"
  on public.job_postings for select
  using (public.is_staff());

-- ------------------------------------------------------------
-- Application history
-- ------------------------------------------------------------

create type public.application_event_kind as enum ('applied', 'stage_changed');

create table public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  kind           public.application_event_kind not null,
  from_stage     public.application_stage,
  to_stage       public.application_stage,
  actor_id       uuid references public.profiles (user_id) on delete set null,
  -- clock_timestamp(): an insert and a stage change in one transaction
  -- must still sort in the order they happened.
  created_at     timestamptz not null default clock_timestamp()
);

create index application_events_application_idx
  on public.application_events (application_id, created_at desc);
create index application_events_recent_idx
  on public.application_events (created_at desc);

alter table public.application_events enable row level security;

create policy "application events: staff read"
  on public.application_events for select
  using (public.is_staff());

-- Applicants see their own application's path, so the tracker can show
-- where a declined application stopped. Staff profiles stay unreadable
-- to them, so actor_id resolves to nothing on their side.
create policy "application events: applicant reads own"
  on public.application_events for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id and a.applicant_id = auth.uid()
    )
  );

create or replace function public.log_application_event()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, kind, to_stage, actor_id, created_at)
    values (new.id, 'applied', new.stage, coalesce(auth.uid(), new.applicant_id), new.created_at);
  elsif new.stage is distinct from old.stage then
    insert into public.application_events (application_id, kind, from_stage, to_stage, actor_id)
    values (new.id, 'stage_changed', old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;

create trigger applications_log_event
  after insert or update on public.applications
  for each row execute function public.log_application_event();

-- Past stage changes were never recorded, so history for existing
-- applications starts at the application itself.
insert into public.application_events (application_id, kind, to_stage, actor_id, created_at)
select a.id, 'applied', 'applied', a.applicant_id, a.created_at
from public.applications a;

-- ------------------------------------------------------------
-- Internal notes. Never visible to the candidate.
-- ------------------------------------------------------------

create table public.application_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id      uuid not null default auth.uid() references public.profiles (user_id),
  body           text not null check (length(btrim(body)) between 1 and 4000),
  created_at     timestamptz not null default now()
);

create index application_notes_application_idx
  on public.application_notes (application_id, created_at desc);

alter table public.application_notes enable row level security;

create policy "application notes: staff read"
  on public.application_notes for select
  using (public.is_staff());

create policy "application notes: staff write as themselves"
  on public.application_notes for insert
  with check (public.is_staff() and author_id = auth.uid());

create policy "application notes: authors delete their own"
  on public.application_notes for delete
  using (public.is_staff() and author_id = auth.uid());

-- ------------------------------------------------------------
-- Notifications: read state, and in-app-only events.
-- ------------------------------------------------------------

alter table public.notifications
  add column read_at timestamptz,
  add column email   boolean not null default true;

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create policy "notifications: mark own read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Recipients may only ever touch read_at: the policy above picks the
-- rows, the column grant below picks the field.
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

alter type public.notification_type add value if not exists 'new_application';
alter type public.notification_type add value if not exists 'document_submitted';
alter type public.notification_type add value if not exists 'staff_message';

-- Fan an in-app-only notification out to every reviewer and admin.
create or replace function public.notify_staff(p_type public.notification_type, p_payload jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, payload, email)
  select p.user_id, p_type, p_payload, false
  from public.profiles p
  where p.role in ('reviewer', 'admin');
end;
$$;

-- Existing applicant notifications, now carrying the posting title.
create or replace function public.notify_application_stage_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.notifications (user_id, type, payload)
    values (
      new.applicant_id,
      'stage_changed',
      jsonb_build_object(
        'application_id', new.id,
        'posting_id', new.posting_id,
        'posting_title', (select title from public.job_postings where id = new.posting_id),
        'from_stage', old.stage,
        'to_stage', new.stage
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_application_received()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_title text;
  v_name  text;
begin
  select title into v_title from public.job_postings where id = new.posting_id;
  select coalesce(nullif(full_name, ''), email) into v_name
  from public.profiles where user_id = new.applicant_id;

  insert into public.notifications (user_id, type, payload)
  values (
    new.applicant_id,
    'application_received',
    jsonb_build_object('application_id', new.id, 'posting_id', new.posting_id, 'posting_title', v_title)
  );

  perform public.notify_staff(
    'new_application',
    jsonb_build_object(
      'application_id', new.id,
      'posting_id', new.posting_id,
      'posting_title', v_title,
      'applicant_name', v_name
    )
  );
  return new;
end;
$$;

-- The review handler again, unchanged except for display names in the
-- payloads, plus a staff notice when a new hire hands a document in.
create or replace function public.handle_submission_review()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_hire uuid;
  v_hire_name text;
  v_doc_name text;
  v_admin record;
begin
  if new.status is distinct from old.status then

    select c.new_hire_profile_id into v_new_hire
    from public.onboarding_cases c
    where c.id = new.case_id;

    select coalesce(nullif(full_name, ''), email) into v_hire_name
    from public.profiles where user_id = v_new_hire;

    select name into v_doc_name
    from public.document_types where id = new.document_type_id;

    if new.status = 'submitted' then
      perform public.notify_staff(
        'document_submitted',
        jsonb_build_object(
          'case_id', new.case_id,
          'submission_id', new.id,
          'document_name', v_doc_name,
          'new_hire_name', v_hire_name
        )
      );
    end if;

    if new.status in ('approved', 'rejected', 'resubmit_requested') then
      insert into public.notifications (user_id, type, payload)
      values (
        v_new_hire,
        'document_decision',
        jsonb_build_object(
          'case_id', new.case_id,
          'submission_id', new.id,
          'document_type_id', new.document_type_id,
          'document_name', v_doc_name,
          'decision', new.status,
          'reviewer_notes', new.reviewer_notes
        )
      );
    end if;

    if new.status = 'approved' and not exists (
      select 1
      from public.document_submissions s
      join public.document_types t on t.id = s.document_type_id
      where s.case_id = new.case_id
        and t.required
        and s.status <> 'approved'
    ) then
      update public.onboarding_cases
      set status = 'complete'
      where id = new.case_id and status <> 'complete';

      if found then
        for v_admin in select user_id from public.profiles where role = 'admin' loop
          insert into public.notifications (user_id, type, payload)
          values (
            v_admin.user_id,
            'case_complete',
            jsonb_build_object(
              'case_id', new.case_id,
              'new_hire_profile_id', v_new_hire,
              'new_hire_name', v_hire_name
            )
          );
        end loop;
      end if;
    end if;

  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- "Email candidates" from the pipeline's bulk bar. One message per
-- selected application; send-notification turns each into an email.
-- ------------------------------------------------------------

create or replace function public.send_candidate_message(
  p_application_ids uuid[],
  p_subject text,
  p_body text
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'only reviewers and admins can message candidates';
  end if;
  if coalesce(length(btrim(p_subject)), 0) = 0 or coalesce(length(btrim(p_body)), 0) = 0 then
    raise exception 'a subject and a message are both required';
  end if;
  if length(p_subject) > 200 or length(p_body) > 5000 then
    raise exception 'subject is limited to 200 characters and the message to 5000';
  end if;

  insert into public.notifications (user_id, type, payload)
  select
    a.applicant_id,
    'staff_message',
    jsonb_build_object(
      'application_id', a.id,
      'posting_title', p.title,
      'subject', btrim(p_subject),
      'message', btrim(p_body),
      'sender_id', auth.uid()
    )
  from public.applications a
  join public.job_postings p on p.id = a.posting_id
  where a.id = any (p_application_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.send_candidate_message(uuid[], text, text) from public, anon;
grant execute on function public.send_candidate_message(uuid[], text, text) to authenticated;

-- ------------------------------------------------------------
-- Only email-worthy rows go out. Projects wired through the
-- 20260707000007 pg_net trigger get the filter here; projects using
-- a dashboard webhook instead are covered by send-notification, which
-- skips rows with email = false itself.
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'webhook_send_notification'
  ) then
    drop trigger if exists notifications_webhook_send on public.notifications;
    create trigger notifications_webhook_send
      after insert on public.notifications
      for each row
      when (new.email)
      execute function public.webhook_send_notification();
  end if;
end;
$$;

-- Live delivery for the bell and toasts. RLS still decides which
-- rows each subscriber receives.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Hardening, per migration 06.
-- ------------------------------------------------------------

revoke execute on function public.log_application_event() from public, anon, authenticated;
revoke execute on function public.notify_staff(public.notification_type, jsonb) from public, anon, authenticated;
