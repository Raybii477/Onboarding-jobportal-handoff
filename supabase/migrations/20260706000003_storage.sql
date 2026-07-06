-- ============================================================
-- 03. Storage: two PRIVATE buckets + RLS on storage.objects.
--
-- Path conventions (enforced by the policies below):
--   resumes/{user_id}/{filename}
--   onboarding-documents/{case_id}/{document_type_id}/{filename}
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('onboarding-documents', 'onboarding-documents', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- resumes: owners manage their own folder; staff can read all.
-- ------------------------------------------------------------

create policy "resumes: owner uploads to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resumes: owner reads own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resumes: staff reads all"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'resumes' and public.is_staff());

create policy "resumes: owner replaces own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resumes: owner deletes own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- onboarding-documents: the new hire can read/write files under
-- their own case; reviewers/admins can read everything (single
-- department, so no extra department filter is needed).
-- ------------------------------------------------------------

create or replace function public.owns_case_folder(object_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.onboarding_cases c
    where c.id::text = (storage.foldername(object_name))[1]
      and c.new_hire_profile_id = auth.uid()
  );
$$;

create policy "onboarding docs: new hire uploads to own case"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'onboarding-documents'
    and public.owns_case_folder(name)
  );

create policy "onboarding docs: new hire reads own case files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'onboarding-documents'
    and public.owns_case_folder(name)
  );

create policy "onboarding docs: staff reads all"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'onboarding-documents' and public.is_staff());

create policy "onboarding docs: new hire replaces own case files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'onboarding-documents'
    and public.owns_case_folder(name)
  );

create policy "onboarding docs: new hire deletes own case files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'onboarding-documents'
    and public.owns_case_folder(name)
  );
