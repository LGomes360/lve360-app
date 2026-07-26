import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How LVE360 collects, uses, stores, exports, and deletes account and wellness information.",
};

const updated = "July 26, 2026";

export default function PrivacyPage() {
  return (
    <div className="bg-gradient-to-b from-[#EAFBF8] via-white to-white px-5 pb-20 pt-32">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#047F6D]">LVE360</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#041B2D]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated {updated}</p>
        <p className="mt-7 leading-7 text-slate-700">
          LVE360 uses the information you provide to create and deliver your Blueprint, maintain your account,
          personalize your weekly experience, process membership payments, and support you. This page explains
          the information involved and the controls available to you.
        </p>

        <PolicySection title="Information we collect">
          <ul>
            <li>Account information, including your name and email address.</li>
            <li>Intake answers about your goals, routines, supplements, medications, and relevant health context.</li>
            <li>Your generated Blueprint, supplement stack, weekly practices, goals, check-ins, and review history.</li>
            <li>Membership and transaction references. Stripe processes your payment card details.</li>
            <li>Basic technical and product-use information used for security, delivery, and product improvement.</li>
          </ul>
        </PolicySection>

        <PolicySection title="How we use information">
          <ul>
            <li>Generate and deliver the personalized experience you request.</li>
            <li>Operate account, reminder, progress, support, and billing features.</li>
            <li>Protect the service, diagnose problems, and understand whether core product flows work.</li>
            <li>Meet legal obligations and enforce our terms.</li>
          </ul>
          <p>
            LVE360 does not use your health information for targeted advertising. LVE360 provides educational
            wellness information and is not a substitute for medical care.
          </p>
        </PolicySection>

        <PolicySection title="Service providers">
          <p>
            We use service providers to operate LVE360, including Tally for intake, Vercel for application hosting,
            Supabase for account and database services, Stripe for payments, OpenAI for supported generation,
            and email delivery providers for reports and account communications. They receive information only
            as needed to provide their services to LVE360.
          </p>
        </PolicySection>

        <PolicySection title="Retention and deletion">
          <p>
            Account information and connected product data are kept while your account is active. You can download
            a copy or permanently delete your account from Settings. Account deletion also cancels an active LVE360
            subscription. Limited records may be retained when required for fraud prevention, security, tax,
            accounting, dispute resolution, or other legal obligations.
          </p>
        </PolicySection>

        <PolicySection title="Your choices">
          <ul>
            <li>Change your preferred name, units, and reminder choice in Settings.</li>
            <li>Download a machine-readable copy of connected account data.</li>
            <li>Permanently delete your account after explicit email confirmation.</li>
            <li>Ask us to correct a report or help with a privacy request.</li>
          </ul>
        </PolicySection>

        <PolicySection title="Security and children">
          <p>
            We use technical and organizational safeguards designed to protect information. No online service can
            guarantee absolute security. LVE360 is intended for adults and is not directed to children under 18.
          </p>
        </PolicySection>

        <PolicySection title="Contact us">
          <p>
            Email <a className="font-semibold text-[#047F6D] underline" href="mailto:support@lve360.com">support@lve360.com</a> for
            privacy questions, access requests, corrections, or deletion help.
          </p>
        </PolicySection>

        <div className="mt-10 border-t border-slate-200 pt-6">
          <Link href="/settings" className="font-semibold text-[#047F6D] hover:underline">
            Return to Settings
          </Link>
        </div>
      </article>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-bold text-[#041B2D]">{title}</h2>
      <div className="mt-3 space-y-3 leading-7 text-slate-700 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}
