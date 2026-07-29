import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact LVE360 for account, billing, privacy, or Blueprint support.",
};

const updated = "July 29, 2026";

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact LVE360"
      updated={updated}
      description="Use the support address below for account, billing, privacy, or Blueprint questions. Please do not send payment card numbers or highly sensitive medical documents by email."
    >
      <section>
        <h2>General and account support</h2>
        <p>
          Email <a href="mailto:support@lve360.com">support@lve360.com</a>. Include the email address
          connected to your account and a short description of the issue. Do not include passwords,
          payment card numbers, or access codes.
        </p>
      </section>

      <section>
        <h2>Billing</h2>
        <p>
          Members can open Settings and choose Manage Billing for subscription changes. If checkout,
          access, or a charge does not look right, email support with the date and a brief description.
          Stripe payment card details should not be sent to LVE360.
        </p>
      </section>

      <section>
        <h2>Privacy requests</h2>
        <p>
          You can download or delete connected account data through Settings. For access,
          correction, deletion, or privacy questions, email support with &quot;Privacy Request&quot;
          in the subject line.
        </p>
      </section>

      <section>
        <h2>Blueprint safety or accuracy concern</h2>
        <p>
          If your Blueprint appears to use the wrong personal information or contains a potentially
          unsafe statement, stop relying on that section and email support with &quot;Blueprint
          Review&quot; in the subject line. Do not use this channel for urgent medical needs.
        </p>
      </section>

      <section>
        <h2>Medical emergencies</h2>
        <p>
          LVE360 does not provide emergency services. Contact local emergency services if you
          believe you may have a medical emergency.
        </p>
      </section>
    </LegalPage>
  );
}
