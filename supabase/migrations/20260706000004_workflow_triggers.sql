-- ============================================================
-- 04. Workflow triggers.
--
-- Notification rows inserted here are picked up by the
-- `send-notification` Edge Function (Database Webhook on INSERT
-- into public.notifications), which sends the actual email via
-- Resend and stamps sent_at.
--
-- The hired -> onboarding_case bridge itself lives in the
-- `hired-to-onboarding` Edge Function (Database Webhook on
-- UPDATE of public.applications), per the handoff spec.
-- ============================================================

-- ------------------------------------------------------------
-- Applications: notify the applicant when their stage changes.
-- ------------------------------------------------------------

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
        'from_stage', old.stage,
        'to_stage', new.stage
      )
    );
  end if;
  return new;
end;
$$;

create trigger applications_notify_stage_change
  after update on public.applications
  for each row execute function public.notify_application_stage_change();

-- ------------------------------------------------------------
-- Applications: acknowledge receipt when a candidate applies.
-- ------------------------------------------------------------

create or replace function public.notify_application_received()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (
    new.applicant_id,
    'application_received',
    jsonb_build_object('application_id', new.id, 'posting_id', new.posting_id)
  );
  return new;
end;
$$;

create trigger applications_notify_received
  after insert on public.applications
  for each row execute function public.notify_application_received();

-- ------------------------------------------------------------
-- Document submissions:
--   * reviewer decision -> notify the new hire
--   * all required docs approved -> auto-complete the case
--     and notify HR (all admins)
-- ------------------------------------------------------------

create or replace function public.handle_submission_review()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_hire uuid;
  v_admin record;
begin
  if new.status is distinct from old.status then

    select c.new_hire_profile_id into v_new_hire
    from public.onboarding_cases c
    where c.id = new.case_id;

    -- Tell the new hire about any reviewer decision on their document.
    if new.status in ('approved', 'rejected', 'resubmit_requested') then
      insert into public.notifications (user_id, type, payload)
      values (
        v_new_hire,
        'document_decision',
        jsonb_build_object(
          'case_id', new.case_id,
          'submission_id', new.id,
          'document_type_id', new.document_type_id,
          'decision', new.status,
          'reviewer_notes', new.reviewer_notes
        )
      );
    end if;

    -- Auto-complete: every REQUIRED document type on this case approved.
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
        -- Notify HR (all admins) that the case is fully vetted.
        for v_admin in select user_id from public.profiles where role = 'admin' loop
          insert into public.notifications (user_id, type, payload)
          values (
            v_admin.user_id,
            'case_complete',
            jsonb_build_object('case_id', new.case_id, 'new_hire_profile_id', v_new_hire)
          );
        end loop;
      end if;
    end if;

  end if;
  return new;
end;
$$;

create trigger document_submissions_handle_review
  after update on public.document_submissions
  for each row execute function public.handle_submission_review();

-- ------------------------------------------------------------
-- Submission bookkeeping: stamp submitted_at / reviewed_at.
-- ------------------------------------------------------------

create or replace function public.stamp_submission_times()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at = now();
    -- A fresh upload clears the previous review outcome.
    new.reviewer_id = null;
    new.reviewer_notes = null;
    new.reviewed_at = null;
  elsif new.status in ('approved', 'rejected', 'resubmit_requested')
        and new.status is distinct from old.status then
    new.reviewed_at = now();
    new.reviewer_id = coalesce(new.reviewer_id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger document_submissions_stamp_times
  before update on public.document_submissions
  for each row execute function public.stamp_submission_times();
