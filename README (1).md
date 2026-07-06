# Onboarding & Job Portal Platform

A single platform, two connected modules, one shared backend.

## Modules

**Job portal** — job postings (public and internal), candidate applications, hiring pipeline.

**Onboarding & vetting** — department-scoped new-hire document collection and review. A hire in the job portal automatically creates an onboarding case here.

## Stack

- Supabase (Postgres, Auth, Storage, Edge Functions)
- Resend (email notifications)
- Vercel (hosting)
- React (frontend)

No Azure subscription is used. Employee SSO runs through the existing Entra ID tenant as an OIDC provider inside Supabase Auth — this only needs the tenant, not a paid Azure subscription. Candidates authenticate separately via Supabase email/magic-link.

## Repo layout

```
apps/web/          React frontend
supabase/
  migrations/       SQL migrations (schema + RLS policies)
docs/
  handoff.md        Full build handoff spec (data model, workflows, build order)
```

## Getting started

1. `cd supabase && supabase init` (if not already linked to the `pbc-flow`-style project convention — use a new Supabase project for this app)
2. Run migrations in `supabase/migrations`
3. `cd apps/web && npm install && npm run dev`
4. Configure environment variables: Supabase URL/anon key, Resend API key, Entra ID OIDC client ID/secret

## Status

Scaffold only — schema, RLS policies, and both modules are not yet implemented. See `docs/handoff.md` for the full spec.
