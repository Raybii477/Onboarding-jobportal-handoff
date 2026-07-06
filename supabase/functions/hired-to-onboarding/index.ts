// Edge Function: hired-to-onboarding
//
// Bridges the job portal and the onboarding module. Wire it up as a
// Supabase Database Webhook:
//
//   Table:  public.applications
//   Events: UPDATE
//   Header: x-webhook-secret: <WEBHOOK_SECRET>
//
// When an application transitions to stage 'hired' it:
//   1. creates an onboarding_case for the applicant (idempotent — the
//      unique constraint on source_application_id prevents duplicates),
//   2. seeds one document_submissions row per document_type (the
//      default checklist),
//   3. inserts an 'onboarding_created' notification, which the
//      send-notification function turns into the Resend email with the
//      new hire's document upload link.
//
// Secrets required: WEBHOOK_SECRET (SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically).

import { createClient } from "npm:@supabase/supabase-js@2";

type ApplicationRecord = {
  id: string;
  applicant_id: string;
  posting_id: string;
  stage: string;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: ApplicationRecord;
  old_record: ApplicationRecord | null;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const payload = (await req.json()) as WebhookPayload;
  const { record, old_record } = payload;

  const becameHired =
    payload.type === "UPDATE" &&
    record?.stage === "hired" &&
    old_record?.stage !== "hired";

  if (!becameHired) {
    return Response.json({ skipped: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Create the case (no-op if the webhook fires twice).
  const { data: existing } = await supabase
    .from("onboarding_cases")
    .select("id")
    .eq("source_application_id", record.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ skipped: true, reason: "case already exists" });
  }

  const { data: onboardingCase, error: caseError } = await supabase
    .from("onboarding_cases")
    .insert({
      new_hire_profile_id: record.applicant_id,
      source_application_id: record.id,
    })
    .select("id")
    .single();

  if (caseError) {
    console.error("failed to create onboarding case", caseError);
    return new Response(caseError.message, { status: 500 });
  }

  // 2. Seed the checklist from the document_types template.
  const { data: docTypes, error: typesError } = await supabase
    .from("document_types")
    .select("id");

  if (typesError) {
    console.error("failed to load document types", typesError);
    return new Response(typesError.message, { status: 500 });
  }

  const { error: seedError } = await supabase.from("document_submissions").insert(
    (docTypes ?? []).map((t) => ({
      case_id: onboardingCase.id,
      document_type_id: t.id,
    })),
  );

  if (seedError) {
    console.error("failed to seed checklist", seedError);
    return new Response(seedError.message, { status: 500 });
  }

  // 3. Queue the "welcome / upload your documents" email.
  const { error: notifyError } = await supabase.from("notifications").insert({
    user_id: record.applicant_id,
    type: "onboarding_created",
    payload: {
      case_id: onboardingCase.id,
      application_id: record.id,
      posting_id: record.posting_id,
    },
  });

  if (notifyError) {
    console.error("failed to queue notification", notifyError);
    return new Response(notifyError.message, { status: 500 });
  }

  return Response.json({ ok: true, case_id: onboardingCase.id });
});
