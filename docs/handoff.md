# Project handoff: Recruitment & Onboarding Platform

## Context
Build a single web platform with two modules sharing one auth/database layer:
1. **Job portal** — public and internal job postings, candidate applications, hiring pipeline
2. **Onboarding & document vetting** — internal, department-scoped, tracks new-hire document collection and review

The two modules are connected: when an application is marked "Hired" in the job portal, it should automatically create an onboarding case for that person.

## Tech stack (already decided, do not deviate)
- **Database/Auth/Storage/Edge Functions:** Supabase (Postgres)
- **Email notifications:** Resend
- **Hosting:** Vercel
- **Frontend:** React
- No Azure subscription exists. Do not propose Azure App Service, Azure SQL, or similar. The only Microsoft-adjacent piece is Entra ID used purely as an OIDC identity provider (see Auth section) — this requires no paid Azure subscription, only the existing tenant.

## Scope
- Job portal: audience is **both public (external candidates) and internal (employees)**. Public postings are visible to anyone; internal postings are visible only to authenticated employees.
- Onboarding & vetting: scoped to **a single department only** (not firm-wide, not multi-tenant). Keep this simple — single-tenant RLS, no organization/tenant table needed for the onboarding side.

## Auth strategy
Two identity paths feeding one `profiles` table:
- **Employees:** SSO via the organization's existing Entra ID tenant, added to Supabase Auth as a custom OIDC provider, restricted to the company domain.
- **Candidates:** standard Supabase email / magic-link auth. Fully separate from the Entra tenant — candidates are external and should never need company credentials.
- `profiles` table carries a `role` enum (`candidate`, `employee`, `reviewer`, `admin`) and drives all Row Level Security policies.
- Flag any Entra ID Conditional Access / MFA requirements that might affect OIDC configuration — ask rather than assume, since we haven't confirmed tenant policy details.

## Data model (starting point — refine as needed)

**Shared**
- `profiles` (user_id FK to auth.users, role, department, full_name, email)
- `notifications` (user_id, type, payload, sent_at) — triggers Resend emails

**Job portal module**
- `job_postings` (title, description, department, visibility: public/internal/both, status: draft/open/closed, created_by)
- `applications` (applicant_id, posting_id, resume_file_path, stage: applied/screening/interview/offer/hired/rejected, referred_by nullable)

**Onboarding module**
- `onboarding_cases` (new_hire_profile_id, source_application_id nullable, status: in_progress/complete, created_at)
- `document_types` (name, description, required boolean) — configurable checklist template
- `document_submissions` (case_id, document_type_id, file_path, status: pending/submitted/approved/rejected/resubmit_requested, reviewer_id, reviewer_notes)

## Storage
Two private Supabase Storage buckets:
- `resumes` — candidates/employees can only read their own files; staff/admin can read all
- `onboarding-documents` — new hire can only read/write their own case files; reviewers/admins can read all within the department

Write RLS policies for both — do not leave either bucket with default/public access.

## Key workflows to implement
1. Admin/HR creates and publishes a job posting (draft → open → closed), setting visibility.
2. Candidate (public) or employee (internal/referral) applies; application enters pipeline at `applied`.
3. HR moves application through pipeline stages.
4. On stage change to `hired`: an Edge Function auto-creates an `onboarding_case` with the default `document_types` checklist, and sends the new hire an email (via Resend) with their document upload link.
5. New hire uploads required documents; each gets `document_submissions` row.
6. Reviewer approves/rejects each submission; rejection triggers a `resubmit_requested` state and notifies the new hire.
7. When all required documents are `approved`, the case auto-marks `complete` and notifies HR.

## Build sequence
1. Schema + RLS policies for all tables above (this is the foundation both modules depend on — get it right first)
2. Entra ID OIDC provider setup in Supabase Auth + employee domain restriction
3. Job portal: postings CRUD, public search/browse, application flow, pipeline stage management
4. Onboarding module: checklist config, document upload, reviewer approve/reject flow, notifications
5. The `hired` → `onboarding_case` Edge Function bridging both modules
6. Vercel deployment, Resend email templates

## Open questions to confirm with the user before/during build
- Any Entra ID Conditional Access or MFA constraints affecting OIDC setup
- Exact list of required document types for the department's onboarding checklist
- Whether internal employees need a distinct "employee portal" view vs. reusing the public job portal UI with extra visibility
