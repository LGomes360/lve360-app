import { Resend } from "resend";
import { parseBlueprintReport, validateBlueprintReport } from "./blueprintReport";
import { REPORT_DISCLAIMER_TEXT, stripReportFences } from "./reportDocument";
import { renderReportPdf } from "./reportPdf";

export type ReportEmailResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type SendReportEmailInput = {
  to: string | null | undefined;
  submissionId: string;
  stackId: string;
  markdown: string;
  generationSource: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function blueprintEmailIdempotencyKey(submissionId: string): string {
  return `blueprint-email-${submissionId}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function buildEmailHtml(reportUrl: string): string {
  const safeUrl = escapeHtml(reportUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f8f8;color:#17324d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f8f8;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d8e5e5;border-radius:14px;overflow:hidden;">
          <tr><td style="background:#073b4c;padding:25px 30px;color:#ffffff;">
            <div style="font-size:25px;font-weight:700;letter-spacing:.3px;">LVE360</div>
            <div style="font-size:13px;margin-top:5px;color:#c7ece8;">Longevity &bull; Vitality &bull; Energy</div>
          </td></tr>
          <tr><td style="padding:32px 30px;">
            <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#17324d;">Your personalized Blueprint is ready</h1>
            <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Your LVE360 report brings your current stack, personalized recommendations, timing guidance, evidence, safety notes, and weekly focus into one practical plan.</p>
            <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">A printable PDF is attached. You can also view the interactive report online.</p>
            <a href="${safeUrl}" style="display:inline-block;background:#00b894;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 22px;border-radius:9px;">View your Blueprint</a>
            <div style="margin-top:28px;padding:16px 18px;background:#eaf8f5;border-radius:10px;font-size:14px;line-height:1.55;color:#35516a;">
              Start with your <strong>This Week Focus</strong> actions and introduce no more than one new supplement at a time.
            </div>
          </td></tr>
          <tr><td style="border-top:1px solid #e3ecec;padding:20px 30px;font-size:12px;line-height:1.5;color:#6b7f90;">
            Educational wellness guidance only; not medical advice. Please keep this email for your records.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendGeneratedBlueprintEmail(input: SendReportEmailInput): Promise<ReportEmailResult> {
  const to = String(input.to ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(to)) return { status: "skipped", reason: "recipient-email-unavailable" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: "skipped", reason: "resend-not-configured" };

  const content = stripReportFences(input.markdown);
  const report = parseBlueprintReport(content);
  const blockingIssues = validateBlueprintReport(report).filter((issue) =>
    issue.startsWith("empty:") || issue === "invalid-marker"
  );
  if (blockingIssues.length) {
    console.warn("[report-email] skipped invalid report", { stackId: input.stackId, blockingIssues });
    return { status: "skipped", reason: "report-validation-failed" };
  }

  try {
    const pdf = await renderReportPdf(report.canonicalMarkdown, REPORT_DISCLAIMER_TEXT);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.lve360.com").replace(/\/$/, "");
    const reportUrl = `${appUrl}/results?submission_id=${encodeURIComponent(input.submissionId)}`;
    const idempotencyKey = blueprintEmailIdempotencyKey(input.submissionId);
    const resend = new Resend(apiKey);
    console.info("[report-email] send attempt", {
      submissionId: input.submissionId,
      stackId: input.stackId,
      generationSource: input.generationSource,
      idempotencyKey,
    });
    const { data, error } = await resend.emails.send(
      {
        from: process.env.REPORT_EMAIL_FROM?.trim() || "LVE360 <reports@lve360.com>",
        replyTo: process.env.REPORT_EMAIL_REPLY_TO?.trim() || "support@lve360.com",
        to,
        subject: "Your personalized LVE360 Blueprint is ready",
        html: buildEmailHtml(reportUrl),
        text: `Your personalized LVE360 Blueprint is ready. View it at ${reportUrl}. A printable PDF is attached. Educational wellness guidance only; not medical advice.`,
        attachments: [{
          filename: "LVE360_Blueprint.pdf",
          content: Buffer.from(pdf),
          contentType: "application/pdf",
        }],
      },
      { idempotencyKey }
    );

    if (error || !data?.id) {
      console.error("[report-email] Resend rejected message", { stackId: input.stackId, error });
      return { status: "failed", reason: "provider-rejected" };
    }
    console.info("[report-email] send completed", {
      submissionId: input.submissionId,
      stackId: input.stackId,
      generationSource: input.generationSource,
      idempotencyKey,
      emailId: data.id,
    });
    return { status: "sent", id: data.id };
  } catch (error) {
    console.error("[report-email] send failed", { stackId: input.stackId, error });
    return { status: "failed", reason: "send-failed" };
  }
}
