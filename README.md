# Onboarding & Job Portal Platform

A single platform, two connected modules, one shared backend.

**Job portal** — job postings (public and internal), candidate applications, hiring pipeline.

**Onboarding & vetting** — department-scoped new-hire document collection and review. Marking an application **Hired** in the job portal automatically creates an onboarding case here.

## Stack

- Supabase (Postgres, Auth, Storage, Edge Functions)
- Resend (email notifications)
- Vercel (hosting)
- React + Vite (frontend)

No Azure subscription is used. Employee SSO runs through the existing Entra ID tenant as an OIDC provider inside Supabase Auth — this only needs the tenant, not a paid subscription. Candidates authenticate separately via Supabase email magic links.

## Repo layout

```
apps/web/                  React frontend (Vite + TypeScript)
supabase/
  migrations/              SQL migrations: schema, RLS, storage policies, triggers, seed
  functions/
    hired-to-onboarding/   Edge Function: hired application -> onboarding case + checklist
    send-notification/     Edge Function: notifications table -> Resend emails
docs/
  handoff.md               Full build handoff spec (data model, workflows, build order)
```

## Setup

### 1. Supabase project

Create a new Supabase project, then from the repo root:

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push                      # applies supabase/migrations in order
```

The migrations create the full schema, enable RLS on every table, create the two **private** storage buckets (`resumes`, `onboarding-documents`) with their policies, install the workflow triggers, and seed a placeholder document checklist.

`20260731000007_document_files.sql` backfills itself: every file already recorded on a `document_submissions` row becomes that submission's first `document_files` row, so it is safe to apply to a project that already holds documents.

### 2. Auth providers

- **Candidates:** email magic-link auth works out of the box (enable the Email provider in Supabase Auth).
- **Employees:** register an app in the Entra ID tenant (redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`), then configure the **Azure** provider in Supabase Auth with the client ID/secret and your tenant ID. Restrict sign-in to the company tenant (single-tenant app registration) so only company accounts can use SSO.
- The `handle_new_user` trigger assigns `role = 'employee'` to any non-email provider sign-in and `role = 'candidate'` to email sign-ins. `reviewer`/`admin` roles are granted manually by an admin (update the row in `profiles`).

> ⚠️ **Open question:** confirm whether the tenant enforces Conditional Access / MFA policies that affect the OIDC app registration before rollout.

### 3. Edge Functions

```bash
supabase secrets set WEBHOOK_SECRET=<random-string> \
  RESEND_API_KEY=<resend-key> \
  SITE_URL=https://<your-vercel-domain> \
  FROM_EMAIL="HR Team <hr@yourdomain.com>"

supabase functions deploy hired-to-onboarding
supabase functions deploy send-notification
```

Then create two **Database Webhooks** (Supabase dashboard → Database → Webhooks), each sending the header `x-webhook-secret: <WEBHOOK_SECRET>`:

| Webhook | Table | Events | Target function |
|---|---|---|---|
| hired bridge | `public.applications` | UPDATE | `hired-to-onboarding` |
| email sender | `public.notifications` | INSERT | `send-notification` |

### 4. Frontend

```bash
cd apps/web
cp .env.example .env      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 5. Vercel

Deploy `apps/web` as the project root (framework: Vite). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. `apps/web/vercel.json` contains the SPA rewrite.

## How the modules connect

1. HR moves an application to **hired** in the pipeline.
2. The database webhook calls the `hired-to-onboarding` Edge Function, which creates an `onboarding_case`, seeds one `document_submissions` row per `document_types` entry, and queues an `onboarding_created` notification.
3. The `send-notification` function emails the new hire (via Resend) their document upload link.
4. The new hire uploads documents; reviewers approve or send back for resubmission (each decision emails the new hire).
5. When every **required** document is approved, a trigger auto-marks the case **complete** and notifies all admins.

## Documents and their files

A checklist item (`document_submissions`) is not one file. Each uploaded file is a `document_files` row, which gives two things:

- **Several files per checklist item** — both sides of an ID, a multi-part contract.
- **Version history** — when a reviewer sends a document back and the new hire uploads again, the previous attempt is *retired*, not overwritten. Retired files stay readable by the new hire and by staff, under "Previous versions".

The retiring is done by the `retire_previous_attempt` trigger, not the client: the client inserts the new files and then flips the submission back to `submitted`, and the trigger tells the two attempts apart by the reviewer's decision timestamp. A second trigger keeps the legacy `document_submissions.file_path` pointing at the newest active file, so nothing has to maintain that pointer by hand.

Reviewers work through **Review** as a file explorer — applicants as folders on the left with a name/email search, the selected applicant's documents on the right, each expanding to its files plus history. Approve / Request Revision / Reject stay on the expanded document.

Storage keys keep the existing `onboarding-documents/{case_id}/{document_type_id}/{filename}` convention, so the bucket policies are unchanged; the original filename is stored on the row for display.

## Open questions (from the handoff — confirm before go-live)

- Entra ID Conditional Access / MFA constraints on the OIDC app registration.
- The exact required document list for the department (the seeded checklist in `20260706000005_seed_document_types.sql` is a placeholder; admins can also edit `document_types` later).
- Whether internal employees need a distinct employee-portal view. Current implementation reuses one job board: RLS simply shows employees the internal postings in addition to public ones.
