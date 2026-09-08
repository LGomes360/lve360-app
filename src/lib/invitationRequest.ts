export const INVITATION_INTERESTS = [
  "Energy",
  "Longevity",
  "Fitness",
  "Nutrition",
  "Supplements",
  "Health routines",
  "Overall wellness",
] as const;

export type InvitationInterest = (typeof INVITATION_INTERESTS)[number];
export type AccessRequestStatus = "pending" | "waitlisted" | "declined";

export type InvitationRequestInput = {
  firstName: string;
  email: string;
  organizingHelp: string;
  interests: InvitationInterest[];
  requestReason?: string;
  referralSource?: string;
  referralCode?: string;
  website?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeInvitationEmail(value: unknown): string {
  return cleanString(value, 320).toLowerCase();
}

export function parseInvitationRequest(value: unknown):
  | { ok: true; data: InvitationRequestInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Please check the form and try again." };
  }

  const raw = value as Record<string, unknown>;
  const firstName = cleanString(raw.firstName, 80);
  const email = normalizeInvitationEmail(raw.email);
  const organizingHelp = cleanString(raw.organizingHelp, 500);
  const requestReason = cleanString(raw.requestReason, 1000);
  const referralSource = cleanString(raw.referralSource, 120);
  const referralCode = cleanString(raw.referralCode, 120);
  const website = cleanString(raw.website, 200);
  const rawInterests = Array.isArray(raw.interests) ? raw.interests : [];
  const interests = Array.from(
    new Set(
      rawInterests.filter((interest): interest is InvitationInterest =>
        INVITATION_INTERESTS.includes(interest as InvitationInterest),
      ),
    ),
  );

  if (!firstName || !EMAIL_PATTERN.test(email) || !organizingHelp) {
    return { ok: false, error: "Please complete your name, email, and what you want help organizing." };
  }

  return {
    ok: true,
    data: {
      firstName,
      email,
      organizingHelp,
      interests,
      requestReason: requestReason || undefined,
      referralSource: referralSource || undefined,
      referralCode: referralCode || undefined,
      website: website || undefined,
    },
  };
}

export function parseFounderReview(value: unknown):
  | { ok: true; status: AccessRequestStatus; notes: string | null }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid review." };
  }

  const raw = value as Record<string, unknown>;
  const status = cleanString(raw.status, 20);
  const notes = cleanString(raw.notes, 2000);
  if (status !== "pending" && status !== "waitlisted" && status !== "declined") {
    return { ok: false, error: "Approval is not available until secure invitation issuance ships." };
  }

  return { ok: true, status, notes: notes || null };
}
