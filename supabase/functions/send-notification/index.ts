// Edge Function: send-notification
//
// Turns rows in public.notifications into Resend emails. Wire it up as
// a Supabase Database Webhook:
//
//   Table:  public.notifications
//   Events: INSERT
//   Header: x-webhook-secret: <WEBHOOK_SECRET>
//
// Secrets required: WEBHOOK_SECRET, RESEND_API_KEY, SITE_URL,
// FROM_EMAIL (e.g. "HR Team <hr@yourdomain.com>" — the domain must be
// verified in Resend).

import { createClient } from "npm:@supabase/supabase-js@2";

type NotificationRecord = {
  id: string;
  user_id: string;
  type:
    | "application_received"
    | "stage_changed"
    | "onboarding_created"
    | "document_decision"
    | "case_complete";
  payload: Record<string, string>;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: NotificationRecord;
};

function composeEmail(
  n: NotificationRecord,
  siteUrl: string,
): { subject: string; html: string } {
  switch (n.type) {
    case "application_received":
      return {
        subject: "We received your application",
        html: `<p>Thanks for applying! Your application is now in our pipeline.</p>
               <p>You can follow its progress at <a href="${siteUrl}/applications">${siteUrl}/applications</a>.</p>`,
      };
    case "stage_changed":
      return {
        subject: "Your application status was updated",
        html: `<p>Your application moved to stage: <strong>${n.payload.to_stage}</strong>.</p>
               <p>Details: <a href="${siteUrl}/applications">${siteUrl}/applications</a></p>`,
      };
    case "onboarding_created":
      return {
        subject: "Welcome aboard — please upload your onboarding documents",
        html: `<p>Congratulations on your new role!</p>
               <p>To get you set up, we need a few documents from you. Please upload them here:</p>
               <p><a href="${siteUrl}/onboarding">${siteUrl}/onboarding</a></p>`,
      };
    case "document_decision": {
      const decision = n.payload.decision;
      const label =
        decision === "approved"
          ? "approved"
          : decision === "resubmit_requested"
            ? "sent back for resubmission"
            : "rejected";
      const notes = n.payload.reviewer_notes
        ? `<p>Reviewer notes: ${n.payload.reviewer_notes}</p>`
        : "";
      return {
        subject: `An onboarding document was ${label}`,
        html: `<p>One of your onboarding documents was <strong>${label}</strong>.</p>${notes}
               <p>Check your checklist: <a href="${siteUrl}/onboarding">${siteUrl}/onboarding</a></p>`,
      };
    }
    case "case_complete":
      return {
        subject: "Onboarding case complete",
        html: `<p>All required documents for an onboarding case have been approved — the case is now complete.</p>
               <p>Review it here: <a href="${siteUrl}/review">${siteUrl}/review</a></p>`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const { record } = (await req.json()) as WebhookPayload;
  if (!record?.id) {
    return Response.json({ skipped: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", record.user_id)
    .single();

  if (profileError || !profile?.email) {
    console.error("no recipient for notification", record.id, profileError);
    return Response.json({ skipped: true, reason: "no recipient email" });
  }

  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const { subject, html } = composeEmail(record, siteUrl);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("FROM_EMAIL"),
      to: [profile.email],
      subject,
      html,
    }),
  });

  if (!resendResponse.ok) {
    const body = await resendResponse.text();
    console.error("resend error", resendResponse.status, body);
    return new Response(`resend failed: ${body}`, { status: 502 });
  }

  await supabase
    .from("notifications")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", record.id);

  return Response.json({ ok: true });
});
