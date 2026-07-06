-- ============================================================
-- 06. Security hardening (from Supabase security advisors).
--
-- 1. Pin search_path on the two trigger functions that lacked it.
-- 2. Trigger functions never need to be invoked through the
--    PostgREST RPC API, so revoke EXECUTE from API roles.
--
-- The RLS helper predicates (is_staff, is_admin, is_internal_user,
-- current_user_role, owns_case, owns_case_folder) intentionally KEEP
-- their EXECUTE grants: policy expressions are evaluated as the
-- calling role, so anon/authenticated need EXECUTE for RLS to work.
-- They only return facts about the caller, so exposure is harmless.
-- ============================================================

alter function public.set_updated_at() set search_path = public;
alter function public.stamp_submission_times() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_privileges() from public, anon, authenticated;
revoke execute on function public.notify_application_stage_change() from public, anon, authenticated;
revoke execute on function public.notify_application_received() from public, anon, authenticated;
revoke execute on function public.handle_submission_review() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.stamp_submission_times() from public, anon, authenticated;
