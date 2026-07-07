-- ============================================================
-- 07. Wire Edge Functions via pg_net triggers (equivalent to
-- dashboard Database Webhooks, created in SQL instead).
--
--   applications UPDATE (stage -> hired)  -> hired-to-onboarding
--   notifications INSERT                  -> send-notification
--
-- The x-webhook-secret header must match the WEBHOOK_SECRET
-- Edge Function secret. NOTE: the value below is environment
-- specific — replace it when deploying to a new project.
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.webhook_hired_to_onboarding()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://esctxnuninvqzrayusfy.supabase.co/functions/v1/hired-to-onboarding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'e9a313fde2eadb704fa2e4afdd0dd1f944d5bea35d532042721ee00d8349ad72'
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'applications',
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );
  return new;
end;
$$;

create trigger applications_webhook_hired
  after update on public.applications
  for each row
  when (old.stage is distinct from new.stage and new.stage = 'hired')
  execute function public.webhook_hired_to_onboarding();

create or replace function public.webhook_send_notification()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://esctxnuninvqzrayusfy.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'e9a313fde2eadb704fa2e4afdd0dd1f944d5bea35d532042721ee00d8349ad72'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

create trigger notifications_webhook_send
  after insert on public.notifications
  for each row
  execute function public.webhook_send_notification();

-- These trigger functions are not RPC-callable either.
revoke execute on function public.webhook_hired_to_onboarding() from public, anon, authenticated;
revoke execute on function public.webhook_send_notification() from public, anon, authenticated;
