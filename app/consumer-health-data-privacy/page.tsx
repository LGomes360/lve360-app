import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Consumer Health Data Privacy",
  description: "How LVE360 handles consumer health data used for the free Blueprint and private workspace.",
};

const updated = "September 7, 2026";

export default function ConsumerHealthDataPrivacyPage() {
  return (
    <LegalPage
      title="Consumer Health Data Privacy"
      updated={updated}
      description="This notice supplements the LVE360 Privacy Policy and describes consumer health data used for the free Blueprint and private workspace. It is intended to make our practices easier to understand, not to reduce any rights available under applicable law."
    >
      <section>
        <h2>1. Consumer health data we may collect</h2>
        <p>LVE360 may process information you choose to provide about health goals, routines, sleep, energy, weight, conditions, medications, hormones, supplements, allergies, preferences, and wellness reflections. We also process records created when you use features such as a Blueprint, routine, reminder, practice, check-in, or report.</p>
        <p>Do not provide information you do not want LVE360 to process. LVE360 is an educational wellness service and is not a healthcare provider or emergency service.</p>
      </section>

      <section>
        <h2>2. Why we use it</h2>
        <p>We use consumer health data to provide the features you request, organize your information, generate educational wellness content, surface evidence and safety context, maintain your saved history, support exports and deletion, secure the service, troubleshoot problems, and improve reliability.</p>
        <p>We do not use health answers, medication names, supplement names, lab data, or private wellness notes for advertising audiences.</p>
      </section>

      <section>
        <h2>3. Where it comes from</h2>
        <p>Consumer health data generally comes directly from you, from your use of LVE360, or from services you choose to connect or use during the LVE360 experience. We may derive organizational summaries or educational suggestions from the information you provide.</p>
      </section>

      <section>
        <h2>4. Service providers and disclosures</h2>
        <p>We use service providers for hosting, authentication, data storage, AI generation, intake, email, payments when enabled, security, and product operations. They process information for LVE360 under their applicable agreements and security controls. We may also disclose information when required by law, to protect the service and its users, or as part of a business transaction subject to appropriate safeguards.</p>
        <p>LVE360 does not sell consumer health data for money. We do not disclose consumer health data to third parties for targeted advertising.</p>
      </section>

      <section>
        <h2>5. Your choices and rights</h2>
        <p>Depending on where you live, you may have rights to access, confirm, correct, delete, or obtain a copy of consumer health data, and to withdraw consent for certain processing. Private members can use Settings to download or delete connected account data. You may also email <a href="mailto:support@lve360.com">support@lve360.com</a> with “Consumer Health Data Request” in the subject line.</p>
        <p>We may need to verify your identity before completing a request. Some information may be retained where reasonably necessary for security, fraud prevention, legal compliance, or other purposes allowed by law.</p>
      </section>

      <section>
        <h2>6. Blueprint information and private access</h2>
        <p>The free Blueprint and private workspace are separate access experiences, but both may process health information. Requesting an invitation does not require detailed health information. If a Blueprint user later receives private access, LVE360 may connect records only when the account and request can be appropriately matched.</p>
      </section>

      <section>
        <h2>7. Contact and appeals</h2>
        <p>Send privacy questions, requests, or appeals to <a href="mailto:support@lve360.com">support@lve360.com</a>. Include the email address connected to your LVE360 activity and a short description of your request. Do not send passwords, payment card numbers, or access codes.</p>
      </section>
    </LegalPage>
  );
}
