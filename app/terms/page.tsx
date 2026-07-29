import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms that apply when you use LVE360 and its membership features.",
};

const updated = "July 29, 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      updated={updated}
      description="These Terms govern your use of the LVE360 website, Blueprint, member dashboard, emails, and related services. By creating an account, submitting an intake, or using LVE360, you agree to these Terms."
    >
      <section>
        <h2>1. Who may use LVE360</h2>
        <p>
          You must be at least 18 years old and legally able to enter into these Terms. You are
          responsible for the accuracy of the information you provide and for protecting access to
          your email account and LVE360 account.
        </p>
      </section>

      <section>
        <h2>2. Educational wellness service</h2>
        <p>
          LVE360 organizes information about wellness goals, routines, supplements, medications,
          and lifestyle practices. It provides educational information and planning tools. It does
          not provide medical care, diagnosis, treatment, prescribing, emergency services, or a
          substitute for a physician, pharmacist, dietitian, therapist, or other qualified
          professional.
        </p>
        <p>
          Review the <a href="/medical-disclaimer">Medical Disclaimer</a> before acting on health or
          supplement information.
        </p>
      </section>

      <section>
        <h2>3. Your decisions and information</h2>
        <p>
          LVE360 depends on the information you provide. Missing, outdated, or inaccurate details
          can make a Blueprint incomplete or inappropriate for your circumstances. You are
          responsible for confirming recommendations with a qualified professional, especially if
          you use medication, have a health condition, are pregnant or nursing, have allergies, or
          are planning a procedure.
        </p>
      </section>

      <section>
        <h2>4. Memberships and billing</h2>
        <ul>
          <li>LVE360 may offer monthly and annual memberships at the prices shown before checkout.</li>
          <li>Memberships renew automatically until canceled unless checkout states otherwise.</li>
          <li>You can manage or cancel future renewals through Settings and Stripe&apos;s billing portal.</li>
          <li>Stripe will show the effective cancellation date and the billing terms for your plan.</li>
          <li>If you believe a charge was made in error, contact support. Rights provided by law remain unaffected.</li>
        </ul>
        <p>
          We may change future pricing or plan features after giving notice required by applicable
          law. A price change does not apply retroactively to a completed billing period.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You may not:</p>
        <ul>
          <li>Use LVE360 for unlawful, deceptive, abusive, or harmful activity.</li>
          <li>Attempt to access another person&apos;s account, Blueprint, or private information.</li>
          <li>Probe, disrupt, reverse engineer, or bypass security or access controls.</li>
          <li>Use automated methods to copy or extract the service beyond normal personal use.</li>
          <li>Present LVE360 output as professional medical advice or use it to provide clinical care.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your content and our materials</h2>
        <p>
          You retain rights in information you submit. You allow LVE360 to process that information
          as needed to provide, secure, support, and improve the service, as described in the{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          LVE360&apos;s software, design, branding, generated presentation, and original service
          materials are protected by applicable intellectual property laws. These Terms grant you
          a limited, personal, nonexclusive right to use the service while your access is active.
        </p>
      </section>

      <section>
        <h2>7. Third-party services and links</h2>
        <p>
          LVE360 relies on third-party services for intake, hosting, data storage, generation,
          payments, and email. Product or affiliate links may lead to independent sellers. LVE360
          does not control their products, availability, content, privacy practices, or fulfillment.
          An affiliate link may generate compensation for LVE360 at no added cost to you.
        </p>
      </section>

      <section>
        <h2>8. Beta features and service changes</h2>
        <p>
          Some features may be identified as beta or testing features. They may change, contain
          errors, or become unavailable. We may modify, suspend, or discontinue features when
          reasonably necessary to improve or protect the service.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers and limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, LVE360 is provided on an &quot;as is&quot; and
          &quot;as available&quot; basis. We do not guarantee uninterrupted access, a particular
          health result, complete identification of every interaction, or that generated information
          will be error-free.
        </p>
        <p>
          To the maximum extent permitted by law, LVE360 and its operators will not be liable for
          indirect, incidental, special, consequential, or punitive damages arising from use of the
          service. Nothing in these Terms excludes liability or consumer rights that cannot legally
          be excluded.
        </p>
      </section>

      <section>
        <h2>10. Suspension and termination</h2>
        <p>
          You may stop using LVE360 at any time and may delete your account through Settings. We may
          restrict or end access if necessary to address fraud, security risks, unlawful conduct,
          material violations of these Terms, or risks to other users or the service.
        </p>
      </section>

      <section>
        <h2>11. Changes and contact</h2>
        <p>
          We may update these Terms as the service changes. We will post the revised date and provide
          additional notice when required. Continued use after an update means the revised Terms
          apply to future use.
        </p>
        <p>
          Questions can be sent to <a href="mailto:support@lve360.com">support@lve360.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
