-- ============================================================
-- 05. Seed the onboarding checklist template.
--
-- PLACEHOLDER LIST — the exact required document types for the
-- department are an open question in the handoff. Adjust names,
-- descriptions and the `required` flags with the department
-- before go-live; rows are editable by admins in-app afterwards.
-- ============================================================

insert into public.document_types (name, description, required, sort_order)
values
  ('Government-issued ID', 'Passport, national ID card, or driver''s licence.', true, 1),
  ('Signed employment contract', 'Countersigned copy of the employment contract.', true, 2),
  ('Tax declaration form', 'Completed tax form for payroll registration.', true, 3),
  ('Bank account details', 'Bank details form for salary payments.', true, 4),
  ('Proof of address', 'Utility bill or bank statement issued within the last 3 months.', true, 5),
  ('Professional certifications', 'Any relevant certifications or licences (optional).', false, 6)
on conflict (name) do nothing;
