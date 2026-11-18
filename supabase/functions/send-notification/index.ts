// Edge Function: send-notification
//
// Turns rows in public.notifications into Resend emails. Wired up either
// by the pg_net trigger in migration 20260707000007 or as a Supabase
// Database Webhook:
//
//   Table:  public.notifications
//   Events: INSERT
//   Header: x-webhook-secret: <WEBHOOK_SECRET>
//
// Rows with email = false are in-app only (staff notices such as "new
// application") and are skipped here as well as filtered by the trigger.
//
// Secrets required: WEBHOOK_SECRET, RESEND_API_KEY, SITE_URL,
// FROM_EMAIL (e.g. "HR Team <hr@yourdomain.com>" — the domain must be
// verified in Resend).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type NotificationRecord = {
  id: string;
  user_id: string;
  type:
    | "application_received"
    | "stage_changed"
    | "onboarding_created"
    | "document_decision"
    | "case_complete"
    | "new_application"
    | "document_submitted"
    | "staff_message";
  payload: Record<string, string | null>;
  email?: boolean;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: NotificationRecord;
};

type Email = { subject: string; html: string };

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not progressed",
};

/** Every value that reaches the HTML goes through here. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Paragraphs from plain text, line breaks kept, all escaped. */
function paras(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#334155">${esc(p).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** The shared layout from the design's email templates: brand bar, white
 *  card, one indigo button, and the plain link for clients that strip it. */
function layout(opts: {
  eyebrow: string;
  heading: string;
  body: string;
  cta?: { label: string; href: string };
  note?: string;
}): string {
  const button = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:10px;background:#4F46E5">
         <a href="${esc(opts.cta.href)}" style="display:inline-block;padding:13px 22px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(opts.cta.label)}</a>
       </td></tr></table>
       <p style="margin:0;font-size:12px;line-height:18px;color:#64748B">If the button does not work, copy this link: <span style="color:#4338CA">${esc(opts.cta.href)}</span></p>`
    : "";
  const note = opts.note
    ? `<div style="margin:0 0 18px;padding:12px 14px;border-radius:10px;background:#FEF2F2;color:#B91C1C;font-size:14px;line-height:20px"><strong>Reviewer note:</strong> ${esc(opts.note)}</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F8FAFC">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 12px;font-family:Inter,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="padding:0 4px 16px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:32px;height:32px;border-radius:9px;background:#4F46E5;color:#fff;font-weight:800;font-size:14px;text-align:center">C</td>
            <td style="padding-left:10px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-weight:800;font-size:16px;color:#0F172A">Careers &amp; Onboarding</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #E2E8F0;border-radius:14px;padding:32px">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748B">${esc(opts.eyebrow)}</p>
          <h1 style="margin:0 0 16px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:24px;line-height:32px;font-weight:800;color:#0F172A">${esc(opts.heading)}</h1>
          ${opts.body}
          ${note}
          ${button}
        </td></tr>
        <tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:#64748B">You're receiving this because of your application or onboarding with us.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#334155">${text}</p>`;

async function caseProgress(supabase: SupabaseClient, caseId: string | null) {
  if (!caseId) return null;
  const { data } = await supabase
    .from("document_submissions")
    .select("status, document_types(required)")
    .eq("case_id", caseId);
  // A to-one embed; the generated types can't know that, hence the cast.
  const required = ((data ?? []) as unknown as { status: string; document_types: { required: boolean } | null }[]).filter(
    (s) => s.document_types?.required !== false,
  );
  return { approved: required.filter((s) => s.status === "approved").length, total: required.length };
}

async function composeEmail(
  n: NotificationRecord,
  name: string,
  siteUrl: string,
  supabase: SupabaseClient,
): Promise<Email | null> {
  const posting = n.payload.posting_title ?? "your application";
  const hi = name ? `, ${esc(name)}` : "";
  switch (n.type) {
    case "application_received":
      return {
        subject: `We received your application for ${posting}`,
        html: layout({
          eyebrow: "Application received",
          heading: `Thanks for applying${name ? `, ${name}` : ""}.`,
          body: p(`Your application for <strong>${esc(posting)}</strong> is in. Our team reviews every application, and you can follow each step online.`),
          cta: { label: "Track my application", href: `${siteUrl}/applications` },
        }),
      };
    case "stage_changed": {
      const to = n.payload.to_stage ?? "";
      if (to === "rejected")
        return {
          subject: `An update on your application for ${posting}`,
          html: layout({
            eyebrow: "Application update",
            heading: "Thank you for your time.",
            body: p(`We've decided not to move forward with your application for <strong>${esc(posting)}</strong>. We'll keep your details in mind, and we'd be glad to see you apply for other roles.`),
            cta: { label: "See open roles", href: siteUrl },
          }),
        };
      if (to === "hired") return null; // onboarding_created sends the welcome instead
      return {
        subject: `Your application moved to ${STAGE_LABEL[to] ?? to}`,
        html: layout({
          eyebrow: "Application update",
          heading: `Good news${name ? `, ${name}` : ""}.`,
          body: p(`Your application for <strong>${esc(posting)}</strong> moved to <strong>${esc(STAGE_LABEL[to] ?? to)}</strong>.`),
          cta: { label: "Track my application", href: `${siteUrl}/applications` },
        }),
      };
    }
    case "onboarding_created":
      return {
        subject: "Welcome to the team. Your onboarding checklist is ready",
        html: layout({
          eyebrow: "You are hired",
          heading: `Welcome to the team${name ? `, ${name}` : ""}.`,
          body: p("Congratulations. Your onboarding checklist is ready. Please upload your documents so we can finish your setup."),
          cta: { label: "Start onboarding", href: `${siteUrl}/onboarding` },
        }),
      };
    case "document_decision": {
      const doc = n.payload.document_name ?? "One of your documents";
      if (n.payload.decision === "approved") {
        const prog = await caseProgress(supabase, n.payload.case_id);
        const left = prog ? prog.total - prog.approved : null;
        const line = prog
          ? p(`Thanks${hi}. You have ${prog.approved} of ${prog.total} required documents approved.${left ? ` ${left} to go.` : " That's everything."}`)
          : "";
        return {
          subject: `Your ${doc} is approved`,
          html: layout({
            eyebrow: "Document approved",
            heading: `Your ${doc} is approved.`,
            body: line,
            cta: { label: "View checklist", href: `${siteUrl}/onboarding` },
          }),
        };
      }
      const revision = n.payload.decision === "resubmit_requested";
      return {
        subject: revision ? `One document needs another look: ${doc}` : `${doc} was not accepted`,
        html: layout({
          eyebrow: revision ? "Revision requested" : "Document not accepted",
          heading: revision ? "One document needs another look." : `${doc} was not accepted.`,
          body: p(`Your <strong>${esc(doc)}</strong> could not be approved yet. Please upload a new copy.`),
          note: n.payload.reviewer_notes ?? undefined,
          cta: { label: "Re-upload document", href: `${siteUrl}/onboarding` },
        }),
      };
    }
    case "case_complete":
      return {
        subject: `Onboarding complete: ${n.payload.new_hire_name ?? "a new hire"}`,
        html: layout({
          eyebrow: "Case complete",
          heading: `${n.payload.new_hire_name ?? "A new hire"} finished onboarding.`,
          body: p("All required documents are approved and the case is marked complete."),
          cta: { label: "Open the case", href: `${siteUrl}/review?tab=cases` },
        }),
      };
    case "staff_message":
      return {
        subject: n.payload.subject ?? "A message from the hiring team",
        html: layout({
          eyebrow: n.payload.posting_title ? `About ${n.payload.posting_title}` : "Message from the hiring team",
          heading: n.payload.subject ?? "A message from the hiring team",
          body: paras(n.payload.message ?? ""),
          cta: { label: "View my applications", href: `${siteUrl}/applications` },
        }),
      };
    case "new_application":
    case "document_submitted":
      return null; // in-app only
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const { record } = (await req.json()) as WebhookPayload;
  if (!record?.id) return Response.json({ skipped: true });
  if (record.email === false) return Response.json({ skipped: true, reason: "in-app only" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", record.user_id)
    .single();

  if (profileError || !profile?.email) {
    console.error("no recipient for notification", record.id, profileError);
    return Response.json({ skipped: true, reason: "no recipient email" });
  }

  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const email = await composeEmail(record, firstName, siteUrl, supabase);
  if (!email) return Response.json({ skipped: true, reason: "no email for this event" });

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("FROM_EMAIL"),
      to: [profile.email],
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!resendResponse.ok) {
    const body = await resendResponse.text();
    console.error("resend error", resendResponse.status, body);
    return new Response(`resend failed: ${body}`, { status: 502 });
  }

  await supabase.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", record.id);

  return Response.json({ ok: true });
});
